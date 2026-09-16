-- =============================================================================
-- reservation_ics_sequence.test.sql — il trigger che versiona l'evento
-- =============================================================================
-- BLOCCO 4 · FASE 4.2. Da lanciare in Studio (SQL Editor) DOPO
-- 20260916100000..100500. BEGIN … ROLLBACK: non lascia niente.
--
-- Regola sotto test: `ics_sequence` sale SOLO quando cambiano data/ora o
-- quando lo status entra in cancelled/declined. Coperti, contatti, note,
-- promemoria, no_show: fermo. Ogni caso è un RAISE EXCEPTION se fallisce e
-- un NOTICE se passa: alla fine si contano i NOTICE.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_activity uuid;
    v_tenant   uuid;
    v_id       uuid;
    v_seq      int;
    v_reminder timestamptz;
BEGIN
    SELECT id, tenant_id INTO v_activity, v_tenant
      FROM public.activities WHERE name = 'San Pietro' LIMIT 1;
    IF v_activity IS NULL THEN
        RAISE EXCEPTION 'sede di prova "San Pietro" non trovata';
    END IF;

    INSERT INTO public.reservations (
        tenant_id, activity_id, reservation_date, reservation_time, party_size,
        customer_name, customer_email, customer_phone, status, source
    ) VALUES (
        v_tenant, v_activity, '2026-10-20', '20:00', 2,
        'TEST ics_sequence', 'test@example.com', '+39 333 0000000', 'confirmed', 'manual'
    ) RETURNING id, ics_sequence INTO v_id, v_seq;

    -- 1. Nasce a 0.
    IF v_seq <> 0 THEN RAISE EXCEPTION 'caso 1: atteso 0, trovato %', v_seq; END IF;
    RAISE NOTICE 'caso 1 ok: nasce a 0';

    -- 2. Coperti → fermo.
    UPDATE public.reservations SET party_size = 4 WHERE id = v_id;
    SELECT ics_sequence INTO v_seq FROM public.reservations WHERE id = v_id;
    IF v_seq <> 0 THEN RAISE EXCEPTION 'caso 2: coperti hanno incrementato (%)', v_seq; END IF;
    RAISE NOTICE 'caso 2 ok: coperti non incrementano';

    -- 3. Nome, email, telefono, note → fermo.
    UPDATE public.reservations
       SET customer_name = 'Altro nome', customer_email = 'altro@example.com',
           customer_phone = '+39 333 1111111', notes = 'note'
     WHERE id = v_id;
    SELECT ics_sequence INTO v_seq FROM public.reservations WHERE id = v_id;
    IF v_seq <> 0 THEN RAISE EXCEPTION 'caso 3: contatti/note hanno incrementato (%)', v_seq; END IF;
    RAISE NOTICE 'caso 3 ok: contatti e note non incrementano';

    -- 4. Ora → +1.
    UPDATE public.reservations SET reservation_time = '22:00' WHERE id = v_id;
    SELECT ics_sequence INTO v_seq FROM public.reservations WHERE id = v_id;
    IF v_seq <> 1 THEN RAISE EXCEPTION 'caso 4: atteso 1, trovato %', v_seq; END IF;
    RAISE NOTICE 'caso 4 ok: ora → 1';

    -- 5. Data → +1. E il promemoria si azzera come prima (trigger gemello).
    UPDATE public.reservations SET reminder_sent_at = now() WHERE id = v_id;
    UPDATE public.reservations SET reservation_date = '2026-10-21' WHERE id = v_id;
    SELECT ics_sequence, reminder_sent_at INTO v_seq, v_reminder
      FROM public.reservations WHERE id = v_id;
    IF v_seq <> 2 THEN RAISE EXCEPTION 'caso 5: atteso 2, trovato %', v_seq; END IF;
    IF v_reminder IS NOT NULL THEN RAISE EXCEPTION 'caso 5: reminder_sent_at non azzerato'; END IF;
    RAISE NOTICE 'caso 5 ok: data → 2, promemoria azzerato';

    -- 6. Stessa ora scritta con i secondi → fermo (IS DISTINCT FROM su time).
    UPDATE public.reservations SET reservation_time = '22:00:00' WHERE id = v_id;
    SELECT ics_sequence INTO v_seq FROM public.reservations WHERE id = v_id;
    IF v_seq <> 2 THEN RAISE EXCEPTION 'caso 6: stessa ora ha incrementato (%)', v_seq; END IF;
    RAISE NOTICE 'caso 6 ok: stessa ora non incrementa';

    -- 7. no_show → fermo (il cliente non è atteso, ma l''evento non cambia natura).
    UPDATE public.reservations SET status = 'no_show' WHERE id = v_id;
    SELECT ics_sequence INTO v_seq FROM public.reservations WHERE id = v_id;
    IF v_seq <> 2 THEN RAISE EXCEPTION 'caso 7: no_show ha incrementato (%)', v_seq; END IF;
    UPDATE public.reservations SET status = 'confirmed' WHERE id = v_id;
    SELECT ics_sequence INTO v_seq FROM public.reservations WHERE id = v_id;
    IF v_seq <> 2 THEN RAISE EXCEPTION 'caso 7b: undo no_show ha incrementato (%)', v_seq; END IF;
    RAISE NOTICE 'caso 7 ok: no_show e ritorno non incrementano';

    -- 8. cancelled → +1.
    UPDATE public.reservations SET status = 'cancelled' WHERE id = v_id;
    SELECT ics_sequence INTO v_seq FROM public.reservations WHERE id = v_id;
    IF v_seq <> 3 THEN RAISE EXCEPTION 'caso 8: atteso 3, trovato %', v_seq; END IF;
    RAISE NOTICE 'caso 8 ok: cancelled → 3';

    -- 9. Già cancelled, si tocca una nota → fermo.
    UPDATE public.reservations SET notes = 'ancora' WHERE id = v_id;
    SELECT ics_sequence INTO v_seq FROM public.reservations WHERE id = v_id;
    IF v_seq <> 3 THEN RAISE EXCEPTION 'caso 9: nota su cancelled ha incrementato (%)', v_seq; END IF;
    RAISE NOTICE 'caso 9 ok: già cancelled, nessun incremento';

    -- 10. declined da pending → +1 (nuova riga).
    INSERT INTO public.reservations (
        tenant_id, activity_id, reservation_date, reservation_time, party_size,
        customer_name, customer_email, customer_phone, status, source
    ) VALUES (
        v_tenant, v_activity, '2026-10-22', '13:00', 2,
        'TEST ics_sequence 2', 'test2@example.com', '+39 333 0000001', 'pending', 'online'
    ) RETURNING id INTO v_id;
    UPDATE public.reservations SET status = 'declined' WHERE id = v_id;
    SELECT ics_sequence INTO v_seq FROM public.reservations WHERE id = v_id;
    IF v_seq <> 1 THEN RAISE EXCEPTION 'caso 10: atteso 1, trovato %', v_seq; END IF;
    RAISE NOTICE 'caso 10 ok: declined → 1';

    -- 11. Spostamento e annullamento nello stesso UPDATE → +1, non +2.
    INSERT INTO public.reservations (
        tenant_id, activity_id, reservation_date, reservation_time, party_size,
        customer_name, customer_email, customer_phone, status, source
    ) VALUES (
        v_tenant, v_activity, '2026-10-23', '13:00', 2,
        'TEST ics_sequence 3', 'test3@example.com', '+39 333 0000002', 'confirmed', 'manual'
    ) RETURNING id INTO v_id;
    UPDATE public.reservations SET reservation_time = '14:00', status = 'cancelled' WHERE id = v_id;
    SELECT ics_sequence INTO v_seq FROM public.reservations WHERE id = v_id;
    IF v_seq <> 1 THEN RAISE EXCEPTION 'caso 11: atteso 1, trovato %', v_seq; END IF;
    RAISE NOTICE 'caso 11 ok: un UPDATE, un incremento';

    RAISE NOTICE 'TUTTI I CASI OK (11)';
END $$;

ROLLBACK;
