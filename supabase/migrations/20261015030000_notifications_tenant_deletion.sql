BEGIN;

-- =============================================================================
-- NOTIFICHE: ATTIVITÀ IN ELIMINAZIONE (PR 3 del motore)
-- =============================================================================
--
-- Un'attività eliminata (`delete-tenant`, solo l'owner) resta recuperabile 30
-- giorni, poi `purge-tenants` la cancella. Avvisi (deciso da Lorenzo il
-- 2026-10-15): campanella a tutti i membri, email all'owner; subito, a 7 giorni
-- e a 1 giorno dall'eliminazione definitiva; e quando viene ripristinata.
--
-- Le righe nascono a livello account (tenant_id NULL, il tenant in
-- data.tenant_id): un'attività eliminata sparisce dal back office, quindi la
-- campanella giusta è quella del Workspace, dove c'è «Ripristina».
--
-- Tipi separati per campanella ed email perché i destinatari sono diversi
-- (tutti i membri / solo l'owner) e il catalogo lega i canali al tipo.
--
-- ⚠️ SYNC: 30 giorni anche in `purge-tenants` (RETENTION_DAYS),
-- `restore-tenant` e `WorkspacePage` (PURGE_AFTER_DAYS). Qui sta in
-- `tenant_purge_at`.
--
-- GRANT e cron nel file successivo (regola 42601).
-- =============================================================================

INSERT INTO public.notification_types
    (event_type, category, type, title_template, message_template, in_app, email, email_template, can_mute)
VALUES
    ('tenant.deletion_scheduled', 'attivita', 'warning',
        '«{tenant_name}» è in eliminazione',
        'Verrà eliminata definitivamente il {purge_date_label}. Fino ad allora il proprietario può ripristinarla dal Workspace.',
        true, false, NULL, false),
    ('tenant.deletion_scheduled_owner', 'attivita', 'warning',
        NULL, NULL,
        false, true, 'tenant_deletion_owner', false),
    ('tenant.deletion_reminder', 'attivita', 'warning',
        '«{tenant_name}» sarà eliminata {days_left_label}',
        'Eliminazione definitiva il {purge_date_label}. Il proprietario può ancora ripristinarla dal Workspace.',
        true, false, NULL, false),
    ('tenant.deletion_reminder_owner', 'attivita', 'warning',
        NULL, NULL,
        false, true, 'tenant_deletion_owner', false),
    ('tenant.restored', 'attivita', 'info',
        '«{tenant_name}» è stata ripristinata',
        'Non verrà più eliminata: la trovi di nuovo tra le tue attività.',
        true, false, NULL, true)
ON CONFLICT (event_type) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Data dell'eliminazione definitiva
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tenant_purge_at(p_deleted_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
    SELECT p_deleted_at + interval '30 days';
$$;

-- -----------------------------------------------------------------------------
-- Dati comuni degli avvisi
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tenant_deletion_notification_data(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
    SELECT jsonb_build_object(
        'tenant_id', t.id,
        'tenant_name', t.name,
        'deleted_at', t.deleted_at,
        'purge_at', public.tenant_purge_at(t.deleted_at),
        'purge_date_label', to_char(public.tenant_purge_at(t.deleted_at) AT TIME ZONE 'Europe/Rome', 'DD/MM/YYYY'),
        'days_left', greatest(0, ceil(extract(epoch FROM (public.tenant_purge_at(t.deleted_at) - now())) / 86400)::int)
    )
    FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND t.deleted_at IS NOT NULL;
$$;

-- -----------------------------------------------------------------------------
-- Subito dopo l'eliminazione (da `delete-tenant`, service role)
-- -----------------------------------------------------------------------------
-- Campanella a tutti i membri tranne chi ha eliminato; email all'owner.
-- Mai un errore verso l'edge: l'eliminazione è già fatta.

CREATE OR REPLACE FUNCTION public.notify_tenant_deletion_scheduled(p_tenant_id uuid, p_actor uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_data  jsonb;
    v_key   text;
    v_count integer := 0;
BEGIN
    v_data := public.tenant_deletion_notification_data(p_tenant_id);
    IF v_data IS NULL THEN
        RETURN 0;
    END IF;

    v_key := 'tenant:' || p_tenant_id || ':' || extract(epoch FROM (v_data ->> 'deleted_at')::timestamptz)::bigint || ':scheduled';

    BEGIN
        v_count := public.notify(
            'tenant.deletion_scheduled',
            jsonb_build_object('tenant_members', true, 'exclude', jsonb_build_array(p_actor)),
            p_tenant_id, v_data, v_key, true);

        PERFORM public.notify(
            'tenant.deletion_scheduled_owner',
            jsonb_build_object('tenant_owner', true),
            p_tenant_id, v_data || jsonb_build_object('kind', 'scheduled'), v_key, true);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_tenant_deletion_scheduled(%): %', p_tenant_id, SQLERRM;
    END;

    RETURN v_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- Promemoria a 7 e a 1 giorno (cron giornaliero)
-- -----------------------------------------------------------------------------
-- Idempotente: dedupe_key per tenant, eliminazione (deleted_at) e soglia, così
-- un secondo giro nello stesso giorno non ripete e un'attività eliminata di
-- nuovo dopo un ripristino riceve i suoi avvisi. Il 7 vale tra 2 e 7 giorni
-- (niente 7 e 1 insieme se un giro salta).

CREATE OR REPLACE FUNCTION public.remind_tenant_deletions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_t       record;
    v_data    jsonb;
    v_days    integer;
    v_mark    text;
    v_label   text;
    v_key     text;
    v_count   integer := 0;
BEGIN
    FOR v_t IN
        SELECT t.id, t.deleted_at
        FROM public.tenants t
        WHERE t.deleted_at IS NOT NULL
          AND public.tenant_purge_at(t.deleted_at) > now()
          AND public.tenant_purge_at(t.deleted_at) <= now() + interval '7 days'
    LOOP
        BEGIN
            v_data := public.tenant_deletion_notification_data(v_t.id);
            v_days := (v_data ->> 'days_left')::int;

            IF v_days <= 1 THEN
                v_mark  := '1';
                v_label := 'domani';
            ELSE
                v_mark  := '7';
                v_label := 'tra ' || v_days || ' giorni';
            END IF;

            v_data := v_data || jsonb_build_object('days_left_label', v_label, 'kind', 'reminder');
            v_key  := 'tenant:' || v_t.id || ':' || extract(epoch FROM v_t.deleted_at)::bigint || ':reminder:' || v_mark;

            v_count := v_count + public.notify(
                'tenant.deletion_reminder',
                jsonb_build_object('tenant_members', true),
                v_t.id, v_data, v_key, true);

            PERFORM public.notify(
                'tenant.deletion_reminder_owner',
                jsonb_build_object('tenant_owner', true),
                v_t.id, v_data, v_key, true);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'remind_tenant_deletions(%): %', v_t.id, SQLERRM;
        END;
    END LOOP;

    RETURN v_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- Dopo il ripristino (da `restore-tenant`, service role)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_tenant_restored(p_tenant_id uuid, p_actor uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_name  text;
    v_count integer := 0;
BEGIN
    SELECT t.name INTO v_name
    FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND t.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    BEGIN
        v_count := public.notify(
            'tenant.restored',
            jsonb_build_object('tenant_members', true, 'exclude', jsonb_build_array(p_actor)),
            p_tenant_id,
            jsonb_build_object('tenant_id', p_tenant_id, 'tenant_name', v_name),
            NULL, true);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_tenant_restored(%): %', p_tenant_id, SQLERRM;
    END;

    RETURN v_count;
END;
$$;

COMMIT;
