BEGIN;

-- =============================================================================
-- MOTORE DELLE NOTIFICHE (PR 1)
-- =============================================================================
--
-- Un solo ingresso per tutte le notifiche del back office: `public.notify`.
-- Chi genera l'evento (edge function con service role, RPC, cron) dice solo
-- «è successo X con questi dati e va a queste persone»; il motore:
--   1. legge il tipo nel catalogo `notification_types` (testi, canali, categoria);
--   2. risolve i destinatari (utenti precisi, owner, ruoli, membri, permesso
--      su una sede) senza doppioni;
--   3. rispetta le preferenze per categoria (`notification_preferences`),
--      tranne per i tipi con `can_mute = false`;
--   4. scrive subito le righe della campanella (`notifications`), con
--      `dedupe_key` facoltativo per non ripetere lo stesso avviso;
--   5. mette in coda le email (`notification_emails`) per i tipi che le
--      prevedono. La coda la svuota un'edge (PR 2).
--
-- I testi restano scritti nella riga (titolo e messaggio in italiano dal
-- modello del catalogo), così la campanella di oggi li mostra senza cambi.
--
-- GRANT/REVOKE e cron nel file successivo (20261015010100): `db push` non
-- accetta CREATE FUNCTION e GRANT nello stesso file (SQLSTATE 42601).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Catalogo dei tipi
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_types (
    event_type       text        PRIMARY KEY,
    category         text        NOT NULL
        CHECK (category IN ('prenotazioni', 'team', 'attivita', 'abbonamento', 'assistenza', 'sistema')),
    type             text        NOT NULL DEFAULT 'info'
        CHECK (type IN ('system', 'promo', 'info', 'invite', 'warning', 'ownership')),
    title_template   text        NULL,
    message_template text        NULL,
    in_app           boolean     NOT NULL DEFAULT true,
    email            boolean     NOT NULL DEFAULT false,
    email_template   text        NULL,
    can_mute         boolean     NOT NULL DEFAULT true,
    enabled          boolean     NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notification_types_email_template_chk
        CHECK (email = false OR email_template IS NOT NULL)
);

ALTER TABLE public.notification_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read notification types" ON public.notification_types;
CREATE POLICY "Authenticated can read notification types"
    ON public.notification_types FOR SELECT TO authenticated
    USING (true);

-- Tipi che esistono già. `ownership_received` lo scrive ancora la RPC del
-- passaggio di proprietà (non passa dal motore): sta qui perché il catalogo
-- sia completo e perché non si possa spegnere.
INSERT INTO public.notification_types
    (event_type, category, type, title_template, message_template, can_mute)
VALUES
    ('reservation.new', 'prenotazioni', 'info',
        'Nuova prenotazione',
        '{customer_name} · {date_label} {time_label} · {party_size} p.', true),
    ('reservation.auto_confirmed', 'prenotazioni', 'info',
        'Prenotazione confermata (auto)',
        '{customer_name} · {date_label} {time_label} · {party_size} p.', true),
    ('reservation.cancelled_by_customer', 'prenotazioni', 'warning',
        'Prenotazione annullata dal cliente',
        '{customer_name} · {date_label} {time_label} · {party_size} p.', true),
    ('support.reply', 'assistenza', 'info',
        'Risposta dal supporto',
        '{subject}', true),
    ('ownership_received', 'attivita', 'ownership',
        NULL, NULL, false)
ON CONFLICT (event_type) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Preferenze per utente e categoria
-- -----------------------------------------------------------------------------
-- Nessuna riga = tutto acceso. La schermata arriva in un secondo giro;
-- `notify` le rispetta già.

CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category   text        NOT NULL
        CHECK (category IN ('prenotazioni', 'team', 'attivita', 'abbonamento', 'assistenza', 'sistema')),
    in_app     boolean     NOT NULL DEFAULT true,
    email      boolean     NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, category)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users manage own notification preferences"
    ON public.notification_preferences FOR ALL TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. Doppioni: dedupe_key sulla campanella
-- -----------------------------------------------------------------------------

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS dedupe_key text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_key_uidx
    ON public.notifications (user_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. Coda delle email
-- -----------------------------------------------------------------------------
-- Tabella di piattaforma: RLS senza policy, privilegi revocati nel file
-- successivo. Scrive solo `notify` (DEFINER); legge e aggiorna solo l'edge
-- con service role.

CREATE TABLE IF NOT EXISTS public.notification_emails (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id uuid        NULL REFERENCES public.notifications(id) ON DELETE SET NULL,
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id       uuid        NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
    to_email        text        NOT NULL,
    event_type      text        NOT NULL,
    template        text        NOT NULL,
    data            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    dedupe_key      text        NULL,
    status          text        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    attempts        integer     NOT NULL DEFAULT 0,
    run_after       timestamptz NOT NULL DEFAULT now(),
    claimed_at      timestamptz NULL,
    last_error      text        NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    sent_at         timestamptz NULL
);

ALTER TABLE public.notification_emails ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS notification_emails_user_dedupe_key_uidx
    ON public.notification_emails (user_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notification_emails_pending_idx
    ON public.notification_emails (run_after)
    WHERE status IN ('pending', 'processing');

-- -----------------------------------------------------------------------------
-- 5. Testo dal modello
-- -----------------------------------------------------------------------------
-- `{chiave}` → `data->>'chiave'`. Segnaposto senza valore → stringa vuota.

CREATE OR REPLACE FUNCTION public.notification_render(p_template text, p_data jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
    v_out text := p_template;
    v_kv  record;
BEGIN
    IF p_template IS NULL THEN
        RETURN NULL;
    END IF;

    FOR v_kv IN SELECT key, value FROM jsonb_each_text(coalesce(p_data, '{}'::jsonb)) LOOP
        v_out := replace(v_out, '{' || v_kv.key || '}', coalesce(v_kv.value, ''));
    END LOOP;

    RETURN regexp_replace(v_out, '\{[a-z0-9_]+\}', '', 'g');
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. notify: l'ingresso unico
-- -----------------------------------------------------------------------------
-- p_recipients (jsonb), regole in unione:
--   {"users": ["<uuid>", ...]}
--   {"tenant_owner": true}                  owner di p_tenant_id
--   {"tenant_roles": ["owner", "admin"]}    owner e/o membri attivi con quel ruolo
--   {"tenant_members": true}                owner + tutti i membri attivi
--   {"activity_permission": {"permission": "reservations.manage", "activity_id": "<uuid>"}}
--   {"exclude": ["<uuid>", ...]}            tolti alla fine
-- p_account_scope: la riga nasce con tenant_id NULL (campanella del Workspace),
--   il tenant resta in data.tenant_id.
-- Ritorna il numero di righe scritte in campanella.
--
-- Mai un errore verso chi chiama per un tipo sconosciuto o spento: WARNING e 0.
-- Chi la chiama da una RPC la avvolge comunque in un blocco EXCEPTION, così
-- un problema delle notifiche non annulla mai l'azione vera.

CREATE OR REPLACE FUNCTION public.notify(
    p_event_type    text,
    p_recipients    jsonb,
    p_tenant_id     uuid    DEFAULT NULL,
    p_data          jsonb   DEFAULT '{}'::jsonb,
    p_dedupe_key    text    DEFAULT NULL,
    p_account_scope boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_type       public.notification_types%ROWTYPE;
    v_rec        jsonb := coalesce(p_recipients, '{}'::jsonb);
    v_data       jsonb := coalesce(p_data, '{}'::jsonb);
    v_users      uuid[];
    v_exclude    uuid[];
    v_all_members boolean;
    v_roles      text[];
    v_perm       text;
    v_activity   uuid;
    v_title      text;
    v_message    text;
    v_count      integer := 0;
BEGIN
    SELECT * INTO v_type
    FROM public.notification_types
    WHERE event_type = p_event_type;

    IF NOT FOUND THEN
        RAISE WARNING 'notify: event_type sconosciuto %', p_event_type;
        RETURN 0;
    END IF;

    IF NOT v_type.enabled THEN
        RETURN 0;
    END IF;

    IF p_tenant_id IS NOT NULL AND NOT (v_data ? 'tenant_id') THEN
        v_data := v_data || jsonb_build_object('tenant_id', p_tenant_id);
    END IF;

    v_all_members := coalesce((v_rec ->> 'tenant_members')::boolean, false);

    SELECT coalesce(array_agg(r.value), '{}')
    INTO v_roles
    FROM jsonb_array_elements_text(coalesce(v_rec -> 'tenant_roles', '[]'::jsonb)) AS r(value);

    IF coalesce((v_rec ->> 'tenant_owner')::boolean, false) THEN
        v_roles := v_roles || ARRAY['owner'];
    END IF;

    SELECT coalesce(array_agg(e.value::uuid), '{}')
    INTO v_exclude
    FROM jsonb_array_elements_text(coalesce(v_rec -> 'exclude', '[]'::jsonb)) AS e(value);

    v_perm     := v_rec -> 'activity_permission' ->> 'permission';
    v_activity := (v_rec -> 'activity_permission' ->> 'activity_id')::uuid;

    SELECT coalesce(array_agg(DISTINCT x.uid), '{}')
    INTO v_users
    FROM (
        SELECT u.value::uuid AS uid
        FROM jsonb_array_elements_text(coalesce(v_rec -> 'users', '[]'::jsonb)) AS u(value)

        UNION ALL

        SELECT t.owner_user_id
        FROM public.tenants t
        WHERE p_tenant_id IS NOT NULL
          AND t.id = p_tenant_id
          AND (v_all_members OR 'owner' = ANY (v_roles))

        UNION ALL

        SELECT tm.user_id
        FROM public.tenant_memberships tm
        WHERE p_tenant_id IS NOT NULL
          AND tm.tenant_id = p_tenant_id
          AND tm.status = 'active'
          AND (v_all_members OR tm.role = ANY (v_roles))

        UNION ALL

        SELECT g.uid
        FROM public.get_users_with_activity_permission(v_perm, v_activity) AS g(uid)
        WHERE v_perm IS NOT NULL
          AND v_activity IS NOT NULL
    ) x
    JOIN auth.users au ON au.id = x.uid
    WHERE x.uid IS NOT NULL
      AND NOT (x.uid = ANY (v_exclude));

    IF cardinality(v_users) = 0 THEN
        RETURN 0;
    END IF;

    v_title   := public.notification_render(v_type.title_template, v_data);
    v_message := public.notification_render(v_type.message_template, v_data);

    -- Campanella
    IF v_type.in_app THEN
        WITH inserted AS (
            INSERT INTO public.notifications
                (user_id, tenant_id, event_type, type, title, message, data, dedupe_key)
            SELECT
                u.uid,
                CASE WHEN p_account_scope THEN NULL ELSE p_tenant_id END,
                v_type.event_type,
                v_type.type,
                v_title,
                v_message,
                v_data,
                p_dedupe_key
            FROM unnest(v_users) AS u(uid)
            LEFT JOIN public.notification_preferences np
                ON np.user_id = u.uid AND np.category = v_type.category
            WHERE NOT v_type.can_mute OR coalesce(np.in_app, true)
            ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
            RETURNING 1
        )
        SELECT count(*) INTO v_count FROM inserted;
    END IF;

    -- Email in coda
    IF v_type.email THEN
        INSERT INTO public.notification_emails
            (user_id, tenant_id, to_email, event_type, template, data, dedupe_key)
        SELECT
            u.uid,
            p_tenant_id,
            au.email,
            v_type.event_type,
            v_type.email_template,
            v_data,
            p_dedupe_key
        FROM unnest(v_users) AS u(uid)
        JOIN auth.users au ON au.id = u.uid
        LEFT JOIN public.notification_preferences np
            ON np.user_id = u.uid AND np.category = v_type.category
        WHERE au.email IS NOT NULL
          AND (NOT v_type.can_mute OR coalesce(np.email, true))
        ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;

    RETURN v_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. Pulizia
-- -----------------------------------------------------------------------------
-- Campanella: lette da più di 90 giorni. Coda email: inviate o fallite da più
-- di 30 giorni. Schedulata ogni notte nel file successivo.

CREATE OR REPLACE FUNCTION public.prune_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_bell   integer;
    v_emails integer;
BEGIN
    DELETE FROM public.notifications
    WHERE read_at IS NOT NULL
      AND read_at < now() - interval '90 days';
    GET DIAGNOSTICS v_bell = ROW_COUNT;

    DELETE FROM public.notification_emails
    WHERE status IN ('sent', 'failed')
      AND created_at < now() - interval '30 days';
    GET DIAGNOSTICS v_emails = ROW_COUNT;

    RETURN v_bell + v_emails;
END;
$$;

COMMIT;
