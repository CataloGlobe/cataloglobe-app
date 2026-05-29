-- =============================================================================
-- Fase 3 RPC #1 — invite_tenant_member esteso
--
-- Estende la firma esistente per supportare il modello permessi multi-sede
-- a 5 ruoli (owner, admin, manager, staff, viewer).
--
-- Cambio firma:
--   OLD: (p_tenant_id uuid, p_email text, p_role text)
--          RETURNS TABLE(membership_id uuid, email text, role text,
--                        invite_token uuid, status text)
--   NEW: (p_tenant_id uuid, p_email text, p_role text, p_activity_ids uuid[])
--          RETURNS uuid  -- id del tenant_memberships
--
-- Logica:
--   - p_role IN ('admin','manager','staff','viewer')  (owner NON invitabile)
--   - p_role='admin'  → p_activity_ids deve essere NULL o []
--   - p_role manager/staff/viewer → p_activity_ids ha >= 1 elemento, tutti
--     appartenenti a p_tenant_id
--   - Caller: owner OR admin OR manager di p_tenant_id
--   - Manager non può invitare admin
--   - Manager può assegnare solo activity tra le sue (intersect con la sua
--     scope manager su p_tenant_id)
--   - Idempotenza pending: RAISE (semantica invariata vs RPC vecchia)
--   - Re-invite revoked/expired: UPDATE in-place + sostituzione tma rows
--   - Email via pg_net.http_post → send-tenant-invite (invariato)
--
-- Note implementative:
--   - SECURITY DEFINER + search_path TO '' + qualifiche schema-qualificate
--   - REVOKE PUBLIC + anon, GRANT authenticated
--   - DROP esplicito vecchia firma (cambio return type richiede DROP)
--   - p_activity_ids deduplicato internamente per evitare violazioni PK su tma
--
-- ⚠️ Caveat staging/prod:
--   Il drawer frontend `src/components/Businesses/InviteMemberDrawer.tsx`
--   passa ancora p_role='member' (default state). Dopo questa migration:
--   - Vecchia chiamata a 3 args ('admin'|'member') → ERROR "function does not
--     exist" (signature cambiata).
--   - Anche se il drawer venisse aggiornato a 4 args, p_role='member' verrà
--     rifiutato (non più in enum valido).
--   Fase 5 sostituirà il drawer con multi-select sedi + selettore ruolo a 4
--   valori. FINO ALLA FASE 5 GLI INVITI NON ADMIN-ONLY NON FUNZIONERANNO.
-- =============================================================================

-- DROP vecchia firma (cambio return type richiede DROP esplicito)
DROP FUNCTION IF EXISTS public.invite_tenant_member(uuid, text, text);

CREATE OR REPLACE FUNCTION public.invite_tenant_member(
  p_tenant_id    uuid,
  p_email        text,
  p_role         text,
  p_activity_ids uuid[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid              uuid := auth.uid();
  v_caller_is_owner  boolean;
  v_caller_is_admin  boolean;
  v_caller_is_manager boolean;
  v_caller_scoped    boolean;        -- true se caller è solo manager (no tenant-wide)
  v_normalized_email text;
  v_user_id          uuid;
  v_status           text;
  v_existing_id      uuid;
  v_member_id        uuid;
  v_token            uuid;
  v_tenant_name      text;
  v_inviter_email    text;
  v_internal_secret  text;
  v_base_url         text;
  v_tm_role          text;           -- valore per tenant_memberships.role
  v_activity_ids     uuid[];         -- p_activity_ids deduplicato
  v_invalid_count    integer;
  v_unauthorized_count integer;
BEGIN
  -- =========================================================================
  -- 1. Auth caller
  -- =========================================================================
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta'
      USING ERRCODE = '42501';
  END IF;

  -- Caller deve appartenere a p_tenant_id come owner OR admin OR manager.
  -- has_permission('team.invite') verifica solo il grant tabellare, NON il
  -- legame caller↔p_tenant_id. Controlliamo entrambe le cose esplicitamente.
  v_caller_is_owner := EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = p_tenant_id
      AND owner_user_id = v_uid
      AND deleted_at IS NULL
  );

  v_caller_is_admin := EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE tenant_id = p_tenant_id
      AND user_id   = v_uid
      AND status    = 'active'
      AND role      = 'admin'
  );

  v_caller_is_manager := EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.tenant_membership_activities tma ON tma.tenant_membership_id = tm.id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = v_uid
      AND tm.status    = 'active'
      AND tma.role     = 'manager'
  );

  IF NOT (v_caller_is_owner OR v_caller_is_admin OR v_caller_is_manager) THEN
    RAISE EXCEPTION 'Permesso negato: non puoi invitare membri in questa azienda'
      USING ERRCODE = '42501';
  END IF;

  -- Verifica anche grant tabellare team.invite (hardening: cambio role_permissions
  -- non richiederebbe modifiche a questa RPC se in futuro si togliesse il
  -- permesso a manager).
  IF NOT public.has_permission('team.invite', NULL) THEN
    RAISE EXCEPTION 'Permesso negato: il tuo ruolo non consente di invitare membri'
      USING ERRCODE = '42501';
  END IF;

  v_caller_scoped := NOT (v_caller_is_owner OR v_caller_is_admin);

  -- =========================================================================
  -- 2. Validazione p_role
  -- =========================================================================
  IF p_role IS NULL OR p_role NOT IN ('admin', 'manager', 'staff', 'viewer') THEN
    RAISE EXCEPTION 'Ruolo non valido: ammessi admin, manager, staff, viewer'
      USING ERRCODE = '22023';
  END IF;

  -- =========================================================================
  -- 3. Regole specifiche per p_role='admin'
  -- =========================================================================
  IF p_role = 'admin' THEN
    -- Solo tenant-wide (owner/admin) può invitare admin
    IF v_caller_scoped THEN
      RAISE EXCEPTION 'Permesso negato: solo owner e admin possono invitare admin'
        USING ERRCODE = '42501';
    END IF;

    -- p_activity_ids deve essere NULL o array vuoto
    IF p_activity_ids IS NOT NULL AND cardinality(p_activity_ids) > 0 THEN
      RAISE EXCEPTION 'admin role does not accept activity_ids'
        USING ERRCODE = '22023';
    END IF;

    v_tm_role := 'admin';

  ELSE
    -- p_role IN ('manager','staff','viewer')
    v_tm_role := NULL;

    IF p_activity_ids IS NULL OR cardinality(p_activity_ids) = 0 THEN
      RAISE EXCEPTION 'Devi specificare almeno una sede per ruoli manager, staff o viewer'
        USING ERRCODE = '22023';
    END IF;

    -- Dedup interno (evita violazioni PK su tma se caller passa duplicati)
    SELECT ARRAY(SELECT DISTINCT unnest(p_activity_ids)) INTO v_activity_ids;

    -- Tutti gli activity devono esistere e appartenere a p_tenant_id
    SELECT count(*) INTO v_invalid_count
    FROM unnest(v_activity_ids) AS a(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.activities act
      WHERE act.id = a.id
        AND act.tenant_id = p_tenant_id
    );

    IF v_invalid_count > 0 THEN
      RAISE EXCEPTION 'Una o più sedi non sono valide o non appartengono a questa azienda'
        USING ERRCODE = '22023';
    END IF;

    -- Se caller è solo manager (no tenant-wide), può assegnare solo le sue sedi
    IF v_caller_scoped THEN
      SELECT count(*) INTO v_unauthorized_count
      FROM unnest(v_activity_ids) AS a(id)
      WHERE a.id NOT IN (
        SELECT tma.activity_id
        FROM public.tenant_membership_activities tma
        JOIN public.tenant_memberships tm ON tm.id = tma.tenant_membership_id
        WHERE tm.user_id   = v_uid
          AND tm.status    = 'active'
          AND tm.tenant_id = p_tenant_id
          AND tma.role     = 'manager'
      );

      IF v_unauthorized_count > 0 THEN
        RAISE EXCEPTION 'Permesso negato: puoi assegnare solo le sedi che gestisci come manager'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- =========================================================================
  -- 4. Normalizza email
  -- =========================================================================
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'Email obbligatoria'
      USING ERRCODE = '22023';
  END IF;

  v_normalized_email := lower(trim(p_email));

  -- Regex base: locale@dominio.tld (no validazione RFC completa, sufficiente
  -- per filtro grossolano lato DB).
  IF v_normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Email non valida'
      USING ERRCODE = '22023';
  END IF;

  -- =========================================================================
  -- 5. Resolve email → user_id
  -- =========================================================================
  SELECT u.id INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = v_normalized_email
  LIMIT 1;

  -- =========================================================================
  -- 6. Lookup esistente
  -- =========================================================================
  SELECT tm.id, tm.status
  INTO v_existing_id, v_status
  FROM public.tenant_memberships tm
  WHERE tm.tenant_id = p_tenant_id
    AND (
          tm.user_id              = v_user_id          -- NULL=NULL → false, safe
       OR lower(tm.invited_email) = v_normalized_email
    )
  ORDER BY tm.created_at DESC
  LIMIT 1;

  IF v_status = 'active'  THEN
    RAISE EXCEPTION 'user already member';
  END IF;
  IF v_status = 'pending' THEN
    RAISE EXCEPTION 'invite already pending';
  END IF;
  -- 'revoked' | 'expired' | 'declined' → v_existing_id set, UPDATE sotto
  -- NULL (nessuna riga) → v_existing_id NULL, INSERT sotto

  -- =========================================================================
  -- 7. Dati per email
  -- =========================================================================
  SELECT t.name INTO v_tenant_name
  FROM public.tenants t WHERE t.id = p_tenant_id;

  SELECT u.email INTO v_inviter_email
  FROM auth.users u WHERE u.id = v_uid;

  SELECT decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_edge_secret'
  LIMIT 1;

  SELECT decrypted_secret INTO v_base_url
  FROM vault.decrypted_secrets
  WHERE name = 'edge_functions_base_url'
  LIMIT 1;

  IF v_base_url IS NULL THEN
    RAISE EXCEPTION 'Config error: edge_functions_base_url not set in vault';
  END IF;

  v_token := gen_random_uuid();

  -- =========================================================================
  -- 8. UPSERT membership + (re)write tma se applicabile
  -- =========================================================================
  IF v_existing_id IS NOT NULL THEN
    -- Re-invite: refresh riga revoked/expired/declined in-place
    UPDATE public.tenant_memberships
    SET
      role               = v_tm_role,
      status             = 'pending',
      invited_by         = v_uid,
      invite_token       = v_token,
      invite_sent_at     = now(),
      invite_expires_at  = now() + interval '7 days',
      invite_accepted_at = NULL,
      user_id            = COALESCE(v_user_id, user_id),
      invited_email      = CASE WHEN v_user_id IS NOT NULL THEN NULL ELSE v_normalized_email END,
      updated_at         = now()
    WHERE id = v_existing_id
    RETURNING id INTO v_member_id;

    -- Sostituisci righe tma: re-invite può cambiare sedi assegnate
    DELETE FROM public.tenant_membership_activities
    WHERE tenant_membership_id = v_member_id;

  ELSE
    -- Fresh invite. Catch unique_violation per race condition con altro INSERT
    -- concorrente (v_unique_pending_invites o v_tenant_memberships_tenant_id_user_id_key).
    BEGIN
      INSERT INTO public.tenant_memberships (
        tenant_id,
        user_id,
        invited_email,
        role,
        status,
        invited_by,
        invite_token,
        invite_sent_at,
        invite_expires_at
      ) VALUES (
        p_tenant_id,
        v_user_id,
        CASE WHEN v_user_id IS NULL THEN v_normalized_email ELSE NULL END,
        v_tm_role,
        'pending',
        v_uid,
        v_token,
        now(),
        now() + interval '7 days'
      )
      RETURNING id INTO v_member_id;

    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'invite already pending';
    END;
  END IF;

  -- INSERT in tma per ruoli activity-scoped
  IF p_role IN ('manager', 'staff', 'viewer') THEN
    INSERT INTO public.tenant_membership_activities (
      tenant_membership_id, activity_id, tenant_id, role
    )
    SELECT v_member_id, a.id, p_tenant_id, p_role
    FROM unnest(v_activity_ids) AS a(id);
  END IF;

  -- =========================================================================
  -- 9. Email fire-and-forget via pg_net
  -- =========================================================================
  PERFORM net.http_post(
    url     := v_base_url || '/functions/v1/send-tenant-invite',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'X-Internal-Secret', coalesce(v_internal_secret, '')
    ),
    body    := jsonb_build_object(
      'email',        v_normalized_email,
      'tenantName',   coalesce(v_tenant_name, ''),
      'inviterEmail', coalesce(v_inviter_email, ''),
      'inviteToken',  v_token::text
    )
  );

  RETURN v_member_id;
END;
$function$;

-- =============================================================================
-- Lockdown grants
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text, uuid[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.invite_tenant_member(uuid, text, text, uuid[]) IS
'Invita un membro con ruolo admin (tenant-wide) o manager/staff/viewer (activity-scoped). '
'Owner/admin possono invitare qualsiasi ruolo; manager solo manager/staff/viewer sulle proprie sedi. '
'Idempotenza: pending → RAISE. Revoked/expired/declined → UPDATE in-place. '
'Email via pg_net → send-tenant-invite. Returns tenant_memberships.id.';
