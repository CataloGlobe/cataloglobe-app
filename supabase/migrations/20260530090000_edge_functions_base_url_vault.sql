-- =============================================================================
-- Fase 3 RPC #1.0 — vault secret edge_functions_base_url + fix RPC esistenti
--
-- Obiettivi:
--   1. Aggiungere vault secret `edge_functions_base_url` (idempotente)
--   2. Rimuovere URL hardcoded da public.invite_tenant_member (vecchia firma)
--      e public.resend_invite — sostituiti con lookup da vault
--   3. Fix dead code in resend_invite: il check `role IN ('owner','admin')` su
--      tenant_memberships è dead per gli owner (owner vive in
--      tenants.owner_user_id, NON ha riga in tenant_memberships dopo Fase 1).
--      Sostituito con triple check: (a) owner di tenants, (b) admin di
--      tenant_memberships. Manager esclusi dal resend per design.
--
-- Note:
--   - Questa migration deve essere applicata PRIMA di 20260530100000
--     (estensione invite_tenant_member a 4 args), così entrambe le RPC nel
--     ciclo di vita di staging/prod restano coerenti col pattern vault.
--   - La nuova firma 4-args di 20260530100000 leggerà lo stesso secret.
--
-- Prod deploy:
--   PRIMA di `supabase db push` su prod, eseguire MANUALMENTE in Studio prod:
--     SELECT vault.create_secret(
--       'https://qomnpzerhbtstbnwxnqc.supabase.co',
--       'edge_functions_base_url',
--       'Base URL for invoking edge functions via pg_net (prod project ref)'
--     );
--   Lo Step 1 di questa migration NON sovrascriverà il secret prod (IF NOT
--   EXISTS), quindi è safe applicare anche dopo aver settato manualmente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Step 1 — Vault secret (idempotente, value = staging URL)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'edge_functions_base_url') THEN
    PERFORM vault.create_secret(
      'https://lxeawrpjfphgdspueiag.supabase.co',
      'edge_functions_base_url',
      'Base URL for invoking edge functions via pg_net. Override per environment (es. prod = qomnpzerhbtstbnwxnqc).'
    );
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- Step 2 — Aggiorna vecchia firma invite_tenant_member (3 args)
--
-- Logica permission/validation preservata IDENTICA alla versione pre-esistente.
-- Solo modifica: blocco pg_net.http_post legge URL dal vault invece di
-- hardcode. La firma 4-args di 20260530100000 la sostituirà subito dopo.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invite_tenant_member(
  p_tenant_id uuid,
  p_email     text,
  p_role      text
)
RETURNS TABLE(membership_id uuid, email text, role text, invite_token uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id         uuid;
  v_status          text;
  v_existing_id     uuid;
  v_token           uuid;
  v_member_id       uuid;
  v_tenant_name     text;
  v_inviter_email   text;
  v_internal_secret text;
  v_base_url        text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.status    = 'active'
      AND tm.role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF p_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'invalid_role: role must be admin or member'
      USING ERRCODE = '22000';
  END IF;

  p_email := lower(trim(p_email));

  SELECT u.id INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = p_email
  LIMIT 1;

  SELECT tm.id, tm.status
  INTO v_existing_id, v_status
  FROM public.tenant_memberships tm
  WHERE tm.tenant_id = p_tenant_id
    AND (
          tm.user_id              = v_user_id
       OR lower(tm.invited_email) = p_email
    )
  ORDER BY tm.created_at DESC
  LIMIT 1;

  IF v_status = 'active'  THEN RAISE EXCEPTION 'user already member';    END IF;
  IF v_status = 'pending' THEN RAISE EXCEPTION 'invite already pending'; END IF;

  SELECT t.name INTO v_tenant_name
  FROM public.tenants t WHERE t.id = p_tenant_id;

  SELECT u.email INTO v_inviter_email
  FROM auth.users u WHERE u.id = auth.uid();

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

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.tenant_memberships
    SET
      role               = p_role,
      status             = 'pending',
      invited_by         = auth.uid(),
      invite_token       = v_token,
      invite_sent_at     = now(),
      invite_expires_at  = now() + interval '7 days',
      invite_accepted_at = NULL,
      user_id            = COALESCE(v_user_id, user_id),
      invited_email      = CASE WHEN v_user_id IS NOT NULL THEN NULL ELSE p_email END
    WHERE id = v_existing_id
    RETURNING id INTO v_member_id;

  ELSE
    BEGIN
      INSERT INTO public.tenant_memberships (
        tenant_id, user_id, invited_email, role, status,
        invited_by, invite_token, invite_sent_at, invite_expires_at
      ) VALUES (
        p_tenant_id, v_user_id,
        CASE WHEN v_user_id IS NULL THEN p_email ELSE NULL END,
        p_role, 'pending',
        auth.uid(), v_token, now(), now() + interval '7 days'
      )
      RETURNING id INTO v_member_id;

    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'invite already pending';
    END;
  END IF;

  PERFORM net.http_post(
    url     := v_base_url || '/functions/v1/send-tenant-invite',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'X-Internal-Secret', coalesce(v_internal_secret, '')
    ),
    body    := jsonb_build_object(
      'email',        p_email,
      'tenantName',   coalesce(v_tenant_name, ''),
      'inviterEmail', coalesce(v_inviter_email, ''),
      'inviteToken',  v_token::text
    )
  );

  RETURN QUERY SELECT v_member_id, p_email, p_role, v_token, 'pending'::text;
END;
$function$;

-- -----------------------------------------------------------------------------
-- Step 3 — Aggiorna resend_invite: vault URL + triple owner check
--
-- Fix dead code: il vecchio check `role IN ('owner','admin')` su
-- tenant_memberships escludeva DI FATTO gli owner perché dopo Fase 1
-- owner vive in tenants.owner_user_id e NON ha riga in tm.
-- Nuova logica: owner (via tenants) OR admin (via tenant_memberships).
-- Manager esclusi (decisione design: resend rimane tenant-level).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resend_invite(p_membership_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid              uuid := auth.uid();
  v_tenant_id        uuid;
  v_status           text;
  v_email            text;
  v_role             text;
  v_token            uuid;
  v_tenant_name      text;
  v_inviter_email    text;
  v_internal_secret  text;
  v_base_url         text;
  v_updated_id       uuid;
  v_caller_is_owner  boolean;
  v_caller_is_admin  boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT
    tm.tenant_id,
    tm.status,
    COALESCE(u.email, tm.invited_email),
    tm.role
  INTO v_tenant_id, v_status, v_email, v_role
  FROM public.tenant_memberships tm
  LEFT JOIN auth.users u ON u.id = tm.user_id
  WHERE tm.id = p_membership_id;

  IF NOT FOUND THEN RETURN false; END IF;

  IF v_status = 'active' THEN
    RAISE EXCEPTION 'cannot resend invite to an active member';
  END IF;

  -- Triple owner check (fix dead code)
  v_caller_is_owner := EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = v_tenant_id
      AND owner_user_id = v_uid
      AND deleted_at IS NULL
  );

  v_caller_is_admin := EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE tenant_id = v_tenant_id
      AND user_id   = v_uid
      AND status    = 'active'
      AND role      = 'admin'
  );

  IF NOT (v_caller_is_owner OR v_caller_is_admin) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT t.name INTO v_tenant_name
  FROM public.tenants t WHERE t.id = v_tenant_id;

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

  UPDATE public.tenant_memberships
  SET
    status             = 'pending',
    invite_token       = v_token,
    invite_sent_at     = now(),
    invite_expires_at  = now() + interval '7 days',
    invite_accepted_at = NULL,
    invited_by         = v_uid
  WHERE id = p_membership_id
  RETURNING id INTO v_updated_id;

  PERFORM net.http_post(
    url     := v_base_url || '/functions/v1/send-tenant-invite',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'X-Internal-Secret', coalesce(v_internal_secret, '')
    ),
    body    := jsonb_build_object(
      'email',        v_email,
      'tenantName',   coalesce(v_tenant_name, ''),
      'inviterEmail', coalesce(v_inviter_email, ''),
      'inviteToken',  v_token::text
    )
  );

  RETURN v_updated_id IS NOT NULL;
END;
$function$;

-- -----------------------------------------------------------------------------
-- Lockdown grants (preservo gli stessi della versione precedente)
-- -----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.resend_invite(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resend_invite(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.resend_invite(uuid) TO authenticated;
