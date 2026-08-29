-- =============================================================================
-- CataloGlobe V2 — Test funzionali del trigger di reset promemoria (casi a → f)
--
-- NON e' una migration. Non vive in supabase/migrations/ e non viene applicato
-- da `supabase db push`.
--
-- ── DOVE ESEGUIRLO ──────────────────────────────────────────────────────────
-- Supabase Studio → SQL Editor, sul progetto STAGING. NON su produzione.
-- Va eseguito DOPO aver applicato 20260829120000..20260829120003.
--
-- NON e' eseguibile via MCP: quella connessione e' in transazione read-only e
-- questo script scrive (poi annulla tutto). Serve una sessione normale.
--
-- ── SICUREZZA ───────────────────────────────────────────────────────────────
-- Tutto dentro un unico BEGIN … ROLLBACK: nessuna riga sopravvive. La
-- prenotazione di prova viene creata qui e sparisce col rollback.
-- Se interrompi a meta', esegui `ROLLBACK;` a mano prima di altro.
--
-- Gira come `postgres`, quindi RLS non e' in mezzo: qui si verifica il
-- trigger, non le policy.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _esiti (
    ordine   int,
    caso     text,
    atteso   text,
    ottenuto text,
    verdetto text
);

DO $$
DECLARE
    v_activity_id  uuid;
    v_tenant_id    uuid;
    v_reservation  uuid;
    v_sent         timestamptz;
    v_confirmed    timestamptz;

    -- Valori sentinella: se sopravvivono, il trigger non ha azzerato.
    c_sent      CONSTANT timestamptz := '2026-08-28 18:00:00+02';
    c_confirmed CONSTANT timestamptz := '2026-08-28 18:20:00+02';
BEGIN
    -- Sede qualsiasi con prenotazioni attive.
    SELECT a.id, a.tenant_id INTO v_activity_id, v_tenant_id
    FROM public.activities a
    WHERE a.enable_reservations
    ORDER BY a.created_at
    LIMIT 1;

    IF v_activity_id IS NULL THEN
        RAISE EXCEPTION 'Nessuna sede con enable_reservations: impossibile testare.';
    END IF;

    -- ═══ caso a — cambio DATA → entrambe azzerate ══════════════════════════
    INSERT INTO public.reservations
        (tenant_id, activity_id, reservation_date, reservation_time, party_size,
         customer_name, customer_email, customer_phone, status,
         reminder_sent_at, guest_confirmed_at)
    VALUES
        (v_tenant_id, v_activity_id, '2026-08-30', '20:00:00', 2,
         'Test Trigger', 'test@example.com', '+39 000 0000000', 'confirmed',
         c_sent, c_confirmed)
    RETURNING id INTO v_reservation;

    UPDATE public.reservations
    SET reservation_date = '2026-08-31'
    WHERE id = v_reservation;

    SELECT reminder_sent_at, guest_confirmed_at
    INTO v_sent, v_confirmed
    FROM public.reservations WHERE id = v_reservation;

    INSERT INTO _esiti VALUES (
        1, 'cambio data → reminder_sent_at e guest_confirmed_at azzerati',
        'entrambe NULL',
        format('reminder=%s confirmed=%s', coalesce(v_sent::text,'NULL'), coalesce(v_confirmed::text,'NULL')),
        CASE WHEN v_sent IS NULL AND v_confirmed IS NULL THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ caso b — cambio ORA → entrambe azzerate ═══════════════════════════
    UPDATE public.reservations
    SET reminder_sent_at = c_sent, guest_confirmed_at = c_confirmed
    WHERE id = v_reservation;

    UPDATE public.reservations
    SET reservation_time = '21:30:00'
    WHERE id = v_reservation;

    SELECT reminder_sent_at, guest_confirmed_at
    INTO v_sent, v_confirmed
    FROM public.reservations WHERE id = v_reservation;

    INSERT INTO _esiti VALUES (
        2, 'cambio ora → reminder_sent_at e guest_confirmed_at azzerati',
        'entrambe NULL',
        format('reminder=%s confirmed=%s', coalesce(v_sent::text,'NULL'), coalesce(v_confirmed::text,'NULL')),
        CASE WHEN v_sent IS NULL AND v_confirmed IS NULL THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ caso c — cambio PARTY_SIZE → NON azzerate ═════════════════════════
    UPDATE public.reservations
    SET reminder_sent_at = c_sent, guest_confirmed_at = c_confirmed
    WHERE id = v_reservation;

    UPDATE public.reservations SET party_size = 5 WHERE id = v_reservation;

    SELECT reminder_sent_at, guest_confirmed_at
    INTO v_sent, v_confirmed
    FROM public.reservations WHERE id = v_reservation;

    INSERT INTO _esiti VALUES (
        3, 'cambio party_size → colonne INTATTE',
        'entrambe valorizzate',
        format('reminder=%s confirmed=%s', coalesce(v_sent::text,'NULL'), coalesce(v_confirmed::text,'NULL')),
        CASE WHEN v_sent = c_sent AND v_confirmed = c_confirmed THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ caso d — cambio NOME e NOTE → NON azzerate ════════════════════════
    UPDATE public.reservations
    SET customer_name = 'Nome Cambiato', notes = 'tavolo vicino alla finestra'
    WHERE id = v_reservation;

    SELECT reminder_sent_at, guest_confirmed_at
    INTO v_sent, v_confirmed
    FROM public.reservations WHERE id = v_reservation;

    INSERT INTO _esiti VALUES (
        4, 'cambio nome e note → colonne INTATTE',
        'entrambe valorizzate',
        format('reminder=%s confirmed=%s', coalesce(v_sent::text,'NULL'), coalesce(v_confirmed::text,'NULL')),
        CASE WHEN v_sent = c_sent AND v_confirmed = c_confirmed THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ caso e — UPDATE che non tocca data ne' ora → NON azzerate ═════════
    -- Riscrive data e ora con lo STESSO valore: la clausola WHEN usa
    -- IS DISTINCT FROM, quindi il trigger non deve scattare. E' il caso che
    -- coglie un confronto sbagliato (es. "colonna presente nella SET" invece
    -- di "valore cambiato").
    UPDATE public.reservations
    SET reservation_date = reservation_date,
        reservation_time = reservation_time,
        updated_at = now()
    WHERE id = v_reservation;

    SELECT reminder_sent_at, guest_confirmed_at
    INTO v_sent, v_confirmed
    FROM public.reservations WHERE id = v_reservation;

    INSERT INTO _esiti VALUES (
        5, 'UPDATE con data/ora invariate (stesso valore) → colonne INTATTE',
        'entrambe valorizzate',
        format('reminder=%s confirmed=%s', coalesce(v_sent::text,'NULL'), coalesce(v_confirmed::text,'NULL')),
        CASE WHEN v_sent = c_sent AND v_confirmed = c_confirmed THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ caso f — cambio di STATO → NON azzerate ═══════════════════════════
    -- E' il percorso di respond-reservation e cancel-reservation-public, che
    -- passano di qui a ogni conferma e a ogni disdetta.
    UPDATE public.reservations SET status = 'cancelled' WHERE id = v_reservation;

    SELECT reminder_sent_at, guest_confirmed_at
    INTO v_sent, v_confirmed
    FROM public.reservations WHERE id = v_reservation;

    INSERT INTO _esiti VALUES (
        6, 'cambio status → colonne INTATTE',
        'entrambe valorizzate',
        format('reminder=%s confirmed=%s', coalesce(v_sent::text,'NULL'), coalesce(v_confirmed::text,'NULL')),
        CASE WHEN v_sent = c_sent AND v_confirmed = c_confirmed THEN 'OK' ELSE 'FALLITO' END
    );
END $$;

-- La colonna `verdetto` deve essere OK su TUTTE le righe.
SELECT ordine, caso, atteso, ottenuto, verdetto FROM _esiti ORDER BY ordine;

SELECT
    count(*)                                   AS casi,
    count(*) FILTER (WHERE verdetto = 'OK')    AS ok,
    count(*) FILTER (WHERE verdetto <> 'OK')   AS falliti
FROM _esiti;

ROLLBACK;
