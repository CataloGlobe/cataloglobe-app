-- Invito: solo il destinatario può accettarlo o rifiutarlo.
--
-- Incidente 07/10/2026 (San Pietro Bistrot): accept_invite_by_token accettava
-- l'invito per qualunque utente loggato e scriveva user_id = auth.uid(). Chi
-- apriva il link con un altro account (sessione già aperta nel browser) si
-- prendeva la membership al posto della persona invitata.
--
-- Ora, prima di toccare la riga:
--   - serve un utente autenticato (42501);
--   - la riga va bloccata (FOR UPDATE) e il chiamante deve essere il
--     destinatario: lo user_id dell'invito, oppure, per gli inviti solo email
--     (user_id NULL), l'email dell'account uguale a invited_email senza badare
--     alle maiuscole. Altrimenti 'invite email mismatch' (42501), che il
--     frontend traduce in «Invito per un altro account».
-- Token non valido, già usato o scaduto: comportamento invariato.
--
-- Corpo ripreso da pg_get_functiondef su staging (07/10/2026).
-- CREATE OR REPLACE conserva owner e GRANT esistenti.

CREATE OR REPLACE FUNCTION public.accept_invite_by_token(p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id            uuid;
  v_user_id       uuid;
  v_invited_email text;
  v_tenant_id     uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta' USING ERRCODE = '42501';
  END IF;

  SELECT tm.id, tm.user_id, tm.invited_email
    INTO v_id, v_user_id, v_invited_email
  FROM public.tenant_memberships tm
  WHERE tm.invite_token      = p_token
    AND tm.status            = 'pending'
    AND tm.invite_expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or already used invite token';
  END IF;

  IF NOT (
    (v_user_id IS NOT NULL AND v_user_id = auth.uid())
    OR (v_user_id IS NULL AND lower(v_invited_email) = lower(auth.email()))
  ) THEN
    RAISE EXCEPTION 'invite email mismatch' USING ERRCODE = '42501';
  END IF;

  -- user_id is set here so get_my_tenant_ids() and all RLS policies that
  -- depend on tm.user_id = auth.uid() work immediately after acceptance.
  UPDATE public.tenant_memberships
  SET
    status             = 'active',
    user_id            = auth.uid(),
    invited_email      = NULL,
    invite_token       = NULL,
    invite_accepted_at = now()
  WHERE id = v_id
  RETURNING tenant_id INTO v_tenant_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'invalid or already used invite token';
  END IF;

  RETURN v_tenant_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decline_invite_by_token(p_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id            uuid;
  v_user_id       uuid;
  v_invited_email text;
  v_declined_id   uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta' USING ERRCODE = '42501';
  END IF;

  SELECT tm.id, tm.user_id, tm.invited_email
    INTO v_id, v_user_id, v_invited_email
  FROM public.tenant_memberships tm
  WHERE tm.invite_token = p_token
    AND tm.status       = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT (
    (v_user_id IS NOT NULL AND v_user_id = auth.uid())
    OR (v_user_id IS NULL AND lower(v_invited_email) = lower(auth.email()))
  ) THEN
    RAISE EXCEPTION 'invite email mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_user_id IS NULL THEN
    DELETE FROM public.tenant_memberships
    WHERE id = v_id
    RETURNING id INTO v_declined_id;
  ELSE
    UPDATE public.tenant_memberships
    SET
      status        = 'declined',
      invite_token  = NULL,
      invited_email = NULL
    WHERE id = v_id
    RETURNING id INTO v_declined_id;
  END IF;

  RETURN v_declined_id IS NOT NULL;
END;
$function$;
