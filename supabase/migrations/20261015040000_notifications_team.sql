BEGIN;

-- =============================================================================
-- NOTIFICHE: TEAM (PR 4 del motore)
-- =============================================================================
--
-- Tre avvisi (deciso da Lorenzo il 2026-10-15):
--   - team.invite_received: a chi viene invitato e ha già un account
--     (riga a livello account: l'azienda non è ancora sua; si accetta dal
--     Workspace). Per chi non ha account resta l'email di send-tenant-invite.
--   - team.invite_accepted: a chi ha invitato e all'owner, non al nuovo membro.
--   - team.invite_expired: a chi ha invitato.
--
-- Ricevuto e accettato: un trigger su tenant_memberships, così valgono tutte
-- le strade (invite_tenant_member, resend_invite, accept_invite_by_token,
-- accept_tenant_invite) senza riscrivere quelle funzioni.
-- Chi ha invitato riceve gli avvisi solo se è ancora owner o membro attivo.
-- Scaduto: dentro expire_old_invites, l'unico punto che lo decide (le righe
-- senza account vengono cancellate, un trigger DELETE non saprebbe distinguere
-- una scadenza da una revoca).
--
-- Mai un errore verso chi scrive: tutto in BEGIN … EXCEPTION, con WARNING.
-- GRANT nel file successivo (regola 42601).
-- =============================================================================

INSERT INTO public.notification_types
    (event_type, category, type, title_template, message_template, in_app, email, email_template, can_mute)
VALUES
    ('team.invite_received', 'team', 'invite',
        'Invito in «{tenant_name}»',
        '{inviter_email} ti ha invitato a collaborare. Accetta o rifiuta dal Workspace.',
        true, false, NULL, false),
    ('team.invite_accepted', 'team', 'info',
        '{member_email} è entrato in «{tenant_name}»',
        'Ha accettato l''invito: ora fa parte del team.',
        true, false, NULL, true),
    ('team.invite_expired', 'team', 'info',
        'Invito scaduto in «{tenant_name}»',
        '{invited_label} non l''ha accettato in 7 giorni. Puoi mandarlo di nuovo da Team.',
        true, false, NULL, true)
ON CONFLICT (event_type) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Chi ha invitato è ancora dentro?
-- -----------------------------------------------------------------------------
-- invited_by resta sulla riga anche se quella persona lascia il team: gli
-- avvisi le arrivano solo se è ancora owner o membro attivo.

CREATE OR REPLACE FUNCTION public.is_tenant_insider(p_tenant_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
    SELECT p_user_id IS NOT NULL AND (
        EXISTS (SELECT 1 FROM public.tenants t
                WHERE t.id = p_tenant_id AND t.owner_user_id = p_user_id)
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id = p_tenant_id AND tm.user_id = p_user_id
                     AND tm.status = 'active')
    );
$$;

-- -----------------------------------------------------------------------------
-- Ricevuto e accettato
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_tenant_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_tenant_name text;
    v_email       text;
BEGIN
    -- Uscita veloce: il trigger scatta a ogni UPDATE della riga.
    IF NOT (
        (NEW.status = 'pending'
         AND NEW.user_id IS NOT NULL
         AND NEW.invite_token IS NOT NULL
         AND (TG_OP = 'INSERT' OR OLD.invite_token IS DISTINCT FROM NEW.invite_token))
        OR (TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'active')
    ) THEN
        RETURN NULL;
    END IF;

    BEGIN
        SELECT t.name INTO v_tenant_name
        FROM public.tenants t
        WHERE t.id = NEW.tenant_id
          AND t.deleted_at IS NULL;

        IF NOT FOUND THEN
            RETURN NULL;
        END IF;

        -- Invito (nuovo, rinnovato o rimandato) a chi ha già un account:
        -- ogni invio porta un token nuovo, che fa da chiave di dedupe.
        IF NEW.status = 'pending'
           AND NEW.user_id IS NOT NULL
           AND NEW.invite_token IS NOT NULL
           AND (TG_OP = 'INSERT' OR OLD.invite_token IS DISTINCT FROM NEW.invite_token)
        THEN
            SELECT u.email INTO v_email
            FROM auth.users u
            WHERE u.id = NEW.invited_by;

            PERFORM public.notify(
                'team.invite_received',
                jsonb_build_object('users', jsonb_build_array(NEW.user_id)),
                NEW.tenant_id,
                jsonb_build_object(
                    'tenant_name', v_tenant_name,
                    'inviter_email', coalesce(v_email, 'Qualcuno'),
                    'membership_id', NEW.id
                ),
                'invite:' || NEW.invite_token,
                true);
        END IF;

        -- Accettato.
        IF TG_OP = 'UPDATE'
           AND OLD.status = 'pending'
           AND NEW.status = 'active'
           AND NEW.user_id IS NOT NULL
        THEN
            SELECT u.email INTO v_email
            FROM auth.users u
            WHERE u.id = NEW.user_id;

            PERFORM public.notify(
                'team.invite_accepted',
                jsonb_build_object(
                    'users', CASE WHEN public.is_tenant_insider(NEW.tenant_id, NEW.invited_by)
                                  THEN jsonb_build_array(NEW.invited_by)
                                  ELSE '[]'::jsonb END,
                    'tenant_owner', true,
                    'exclude', jsonb_build_array(NEW.user_id)),
                NEW.tenant_id,
                jsonb_build_object(
                    'tenant_name', v_tenant_name,
                    'member_email', coalesce(v_email, 'Un nuovo membro'),
                    'membership_id', NEW.id
                ),
                'accepted:' || NEW.id || ':' || coalesce(OLD.invite_token::text, ''),
                false);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_tenant_membership_change(%): %', NEW.id, SQLERRM;
    END;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tenant_memberships_notify ON public.tenant_memberships;
CREATE TRIGGER tenant_memberships_notify
    AFTER INSERT OR UPDATE ON public.tenant_memberships
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_tenant_membership_change();

-- -----------------------------------------------------------------------------
-- Scaduto: expire_old_invites con l'avviso a chi ha invitato
-- -----------------------------------------------------------------------------
-- Dalla definizione live (staging, 2026-10-15). Stesso comportamento: le righe
-- senza account si cancellano, le altre passano a 'expired' senza email
-- residua. In più: prima di toccarle, un avviso per riga a invited_by.
-- search_path da 'public' a '': il corpo era già tutto qualificato.

CREATE OR REPLACE FUNCTION public.expire_old_invites()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_deleted_count integer;
    v_updated_count integer;
    v_inv           record;
BEGIN
    -- Step 0: avvisi (mai bloccanti)
    FOR v_inv IN
        SELECT tm.id, tm.tenant_id, tm.invited_by, tm.invite_token,
               u.email AS email,
               t.name AS tenant_name
        FROM public.tenant_memberships tm
        JOIN public.tenants t ON t.id = tm.tenant_id AND t.deleted_at IS NULL
        LEFT JOIN auth.users u ON u.id = tm.user_id
        WHERE tm.status = 'pending'
          AND tm.invite_expires_at IS NOT NULL
          AND tm.invite_expires_at < now()
          AND public.is_tenant_insider(tm.tenant_id, tm.invited_by)
    LOOP
        BEGIN
            PERFORM public.notify(
                'team.invite_expired',
                jsonb_build_object('users', jsonb_build_array(v_inv.invited_by)),
                v_inv.tenant_id,
                jsonb_build_object(
                    'tenant_name', v_inv.tenant_name,
                    -- Senza account la riga si cancella proprio per non
                    -- tenere l'email: non la si copia nella campanella.
                    'invited_label', coalesce(v_inv.email, 'Chi hai invitato')
                ),
                'expired:' || v_inv.id || ':' || coalesce(v_inv.invite_token::text, ''),
                false);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'expire_old_invites notify(%): %', v_inv.id, SQLERRM;
        END;
    END LOOP;

    -- Step 1: DELETE righe email-only (no PII residua)
    DELETE FROM public.tenant_memberships
    WHERE status = 'pending'
      AND invite_expires_at IS NOT NULL
      AND invite_expires_at < now()
      AND user_id IS NULL;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Step 2: UPDATE righe con user_id (azzera invited_email residua)
    UPDATE public.tenant_memberships
    SET status        = 'expired',
        invited_email = NULL
    WHERE status = 'pending'
      AND invite_expires_at IS NOT NULL
      AND invite_expires_at < now()
      AND user_id IS NOT NULL;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RETURN v_deleted_count + v_updated_count;
END;
$function$;

COMMIT;
