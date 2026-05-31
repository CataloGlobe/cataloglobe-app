-- =============================================================================
-- Fase 3 RPC #2 — change_member_role esteso
--
-- Sostituisce la vecchia firma a 3 args con nuova firma per il modello
-- permessi multi-sede a 5 ruoli (owner, admin, manager, staff, viewer).
--
-- Cambio firma:
--   OLD: (p_tenant_id uuid, p_user_id uuid, p_role text) RETURNS boolean
--          - role enum: 'admin' | 'member' (rotto post-Fase 2)
--          - caller check tm.role IN ('owner','admin') (owner = dead code)
--          - solo UPDATE su tm.role, no gestione tma
--   NEW: (p_membership_id uuid, p_new_role text, p_activity_ids uuid[])
--          RETURNS uuid
--          - role enum: 'admin' | 'manager' | 'staff' | 'viewer'
--          - triple owner check (tenants.owner_user_id + tm.role='admin' + tma.role='manager')
--          - gestione atomica tm + tma per transizioni tra scope
--
-- Logica:
--   - Owner NON modificabile (transfer_ownership separato)
--   - Manager NON può cambiare admin né promuovere a admin
--   - Manager può modificare solo membership con tma su sedi nel SUO scope
--   - Transizione: DELETE+INSERT su tma (thin rows, no semantica da preservare)
--   - Idempotente: stesso ruolo + stesse sedi è no-op semantica
--
-- ⚠️ Caveat frontend:
--   src/components/Businesses/MemberDrawer/MemberDrawer.tsx:47 chiama la
--   vecchia firma (3 args). Dopo questa migration → 'function does not exist'.
--   Fase 5 sostituirà il drawer con multi-select sedi + selettore ruolo a 4
--   valori. FINO ALLA FASE 5 IL CAMBIO RUOLO NON FUNZIONERÀ via UI.
-- =============================================================================

-- DROP vecchia firma (cambio args + return type richiede DROP esplicito)
DROP FUNCTION IF EXISTS public.change_member_role(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.change_member_role(
  p_membership_id uuid,
  p_new_role      text,
  p_activity_ids  uuid[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid                 uuid := auth.uid();
  v_target_tenant_id    uuid;
  v_target_user_id      uuid;
  v_target_role         text;
  v_target_status       text;
  v_target_is_admin     boolean;
  v_caller_is_owner     boolean;
  v_caller_is_admin     boolean;
  v_caller_is_manager   boolean;
  v_caller_scoped       boolean;
  v_tm_role             text;
  v_activity_ids        uuid[];
  v_invalid_count       integer;
  v_unauthorized_count  integer;
  v_target_unauthorized integer;
BEGIN
  -- =========================================================================
  -- 0. Auth presence
  -- =========================================================================
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta'
      USING ERRCODE = '42501';
  END IF;

  -- =========================================================================
  -- 1. Resolve target membership
  -- =========================================================================
  SELECT tm.tenant_id, tm.user_id, tm.role, tm.status
  INTO v_target_tenant_id, v_target_user_id, v_target_role, v_target_status
  FROM public.tenant_memberships tm
  WHERE tm.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership non trovata'
      USING ERRCODE = '44000';
  END IF;

  IF v_target_status NOT IN ('active', 'pending') THEN
    RAISE EXCEPTION 'Impossibile modificare il ruolo di una membership in stato %', v_target_status
      USING ERRCODE = '22023';
  END IF;

  -- Owner of tenant (per tenants.owner_user_id) NON è modificabile via questa RPC.
  -- (Nota: oggi owner non ha riga in tm, quindi v_target_user_id != owner_user_id.
  --  Hardening difensivo.)
  IF EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = v_target_tenant_id
      AND owner_user_id = v_target_user_id
  ) THEN
    RAISE EXCEPTION 'Impossibile modificare il ruolo dell''owner. Usa transfer_ownership.'
      USING ERRCODE = '42501';
  END IF;

  v_target_is_admin := (v_target_role = 'admin');

  -- =========================================================================
  -- 2. Auth caller
  -- =========================================================================
  v_caller_is_owner := EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = v_target_tenant_id
      AND owner_user_id = v_uid
      AND deleted_at IS NULL
  );

  v_caller_is_admin := EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE tenant_id = v_target_tenant_id
      AND user_id   = v_uid
      AND status    = 'active'
      AND role      = 'admin'
  );

  v_caller_is_manager := EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.tenant_membership_activities tma ON tma.tenant_membership_id = tm.id
    WHERE tm.tenant_id = v_target_tenant_id
      AND tm.user_id   = v_uid
      AND tm.status    = 'active'
      AND tma.role     = 'manager'
  );

  IF NOT (v_caller_is_owner OR v_caller_is_admin OR v_caller_is_manager) THEN
    RAISE EXCEPTION 'Permesso negato: non puoi modificare ruoli in questa azienda'
      USING ERRCODE = '42501';
  END IF;

  -- Hardening: grant tabellare team.manage_roles deve essere true.
  -- Se in futuro si revoca a manager, la RPC torna 42501 automaticamente.
  IF NOT public.has_permission('team.manage_roles', NULL) THEN
    RAISE EXCEPTION 'Permesso negato: il tuo ruolo non consente di modificare ruoli'
      USING ERRCODE = '42501';
  END IF;

  v_caller_scoped := NOT (v_caller_is_owner OR v_caller_is_admin);

  -- =========================================================================
  -- 3. Validazione p_new_role
  -- =========================================================================
  IF p_new_role IS NULL OR p_new_role NOT IN ('admin', 'manager', 'staff', 'viewer') THEN
    RAISE EXCEPTION 'Ruolo non valido: ammessi admin, manager, staff, viewer'
      USING ERRCODE = '22023';
  END IF;

  -- =========================================================================
  -- 4. Vincoli caller scoped (manager)
  -- =========================================================================
  IF v_caller_scoped THEN
    -- Manager NON può modificare admin esistente
    IF v_target_is_admin THEN
      RAISE EXCEPTION 'Permesso negato: solo owner e admin possono modificare il ruolo di un admin'
        USING ERRCODE = '42501';
    END IF;

    -- Manager NON può promuovere a admin
    IF p_new_role = 'admin' THEN
      RAISE EXCEPTION 'Permesso negato: solo owner e admin possono assegnare il ruolo admin'
        USING ERRCODE = '42501';
    END IF;

    -- Manager può toccare solo membership con TUTTE le tma su sedi nel suo scope
    SELECT count(*) INTO v_target_unauthorized
    FROM public.tenant_membership_activities tma
    WHERE tma.tenant_membership_id = p_membership_id
      AND tma.activity_id NOT IN (
        SELECT tma2.activity_id
        FROM public.tenant_membership_activities tma2
        JOIN public.tenant_memberships tm2 ON tm2.id = tma2.tenant_membership_id
        WHERE tm2.user_id   = v_uid
          AND tm2.status    = 'active'
          AND tm2.tenant_id = v_target_tenant_id
          AND tma2.role     = 'manager'
      );

    IF v_target_unauthorized > 0 THEN
      RAISE EXCEPTION 'Permesso negato: puoi modificare solo membri assegnati alle sedi che gestisci'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- =========================================================================
  -- 5. Validazione p_activity_ids
  -- =========================================================================
  IF p_new_role = 'admin' THEN
    IF p_activity_ids IS NOT NULL AND cardinality(p_activity_ids) > 0 THEN
      RAISE EXCEPTION 'admin role does not accept activity_ids'
        USING ERRCODE = '22023';
    END IF;
    v_tm_role := 'admin';

  ELSE
    -- manager/staff/viewer
    v_tm_role := NULL;

    IF p_activity_ids IS NULL OR cardinality(p_activity_ids) = 0 THEN
      RAISE EXCEPTION 'Devi specificare almeno una sede per ruoli manager, staff o viewer'
        USING ERRCODE = '22023';
    END IF;

    SELECT ARRAY(SELECT DISTINCT unnest(p_activity_ids)) INTO v_activity_ids;

    -- Tutti su tenant target
    SELECT count(*) INTO v_invalid_count
    FROM unnest(v_activity_ids) AS a(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.activities act
      WHERE act.id = a.id
        AND act.tenant_id = v_target_tenant_id
    );

    IF v_invalid_count > 0 THEN
      RAISE EXCEPTION 'Una o più sedi non sono valide o non appartengono a questa azienda'
        USING ERRCODE = '22023';
    END IF;

    -- Se caller è solo manager, tutti devono essere nelle sue sedi
    IF v_caller_scoped THEN
      SELECT count(*) INTO v_unauthorized_count
      FROM unnest(v_activity_ids) AS a(id)
      WHERE a.id NOT IN (
        SELECT tma.activity_id
        FROM public.tenant_membership_activities tma
        JOIN public.tenant_memberships tm ON tm.id = tma.tenant_membership_id
        WHERE tm.user_id   = v_uid
          AND tm.status    = 'active'
          AND tm.tenant_id = v_target_tenant_id
          AND tma.role     = 'manager'
      );

      IF v_unauthorized_count > 0 THEN
        RAISE EXCEPTION 'Permesso negato: puoi assegnare solo le sedi che gestisci come manager'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- =========================================================================
  -- 6. Esegui transizione (atomica)
  -- =========================================================================
  UPDATE public.tenant_memberships
  SET role       = v_tm_role,
      updated_at = now()
  WHERE id = p_membership_id;

  DELETE FROM public.tenant_membership_activities
  WHERE tenant_membership_id = p_membership_id;

  IF p_new_role IN ('manager', 'staff', 'viewer') THEN
    INSERT INTO public.tenant_membership_activities (
      tenant_membership_id, activity_id, tenant_id, role
    )
    SELECT p_membership_id, a.id, v_target_tenant_id, p_new_role
    FROM unnest(v_activity_ids) AS a(id);
  END IF;

  RETURN p_membership_id;
END;
$function$;

-- =============================================================================
-- Lockdown grants
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.change_member_role(uuid, text, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.change_member_role(uuid, text, uuid[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.change_member_role(uuid, text, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.change_member_role(uuid, text, uuid[]) IS
'Cambia ruolo di una membership esistente. Owner/admin possono modificare qualsiasi non-owner; '
'manager può modificare solo membership nel suo scope, e solo verso manager/staff/viewer. '
'Owner non modificabile (usa transfer_ownership). Transizione atomica tm.role + tma rows.';
