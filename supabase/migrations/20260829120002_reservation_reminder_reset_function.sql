-- =============================================================================
-- reset_reservation_reminder_on_reschedule() — trigger BEFORE UPDATE
-- su public.reservations
-- =============================================================================
--
-- Azzera `reminder_sent_at` e `guest_confirmed_at` quando la prenotazione
-- viene spostata a un'altra data o a un altro orario.
--
-- ── Il problema che risolve ─────────────────────────────────────────────────
-- Le due colonne descrivono fatti legati a UN appuntamento preciso. Spostare
-- la prenotazione crea un appuntamento diverso, e senza questo trigger i due
-- fatti sopravvivono al loro oggetto:
--
--   - `reminder_sent_at` valorizzato esclude la riga dalla query del cron, e
--     la sera prima della data NUOVA non parte nulla. Nessun errore, nessun
--     log: solo un'email che non arriva e che nessuno si accorge che manca.
--   - `guest_confirmed_at` valorizzato mostra in dashboard "il cliente ha
--     confermato" per un orario che il cliente non ha mai visto. E' il piu'
--     grave dei due: non e' un'informazione assente, e' un'informazione falsa,
--     e la sala ci decide sopra se telefonare o no.
--
-- ── Perche' un trigger e non il call site ───────────────────────────────────
-- L'invariante appartiene al dato, non a chi lo scrive. Oggi l'unico writer di
-- data/ora e' `updateReservation` (src/services/supabase/reservations.ts), un
-- UPDATE diretto sotto RLS; domani ci saranno un'edge di modifica, un import,
-- una query in console. Una regola messa nel frontend andrebbe ripetuta in
-- ognuno di quei punti, e basterebbe dimenticarla una volta per riavere il
-- caso sopra.
--
-- ── Perche' solo data e ora ─────────────────────────────────────────────────
-- `party_size`, nome e note NON azzerano nulla. Chi ha detto "vengo" resta
-- impegnato se il tavolo passa da 4 a 5 coperti — e' quasi sempre una modifica
-- chiesta dal cliente stesso. Data e ora sono un altro appuntamento, e la
-- conferma non lo segue.
--
-- ── SECURITY INVOKER ────────────────────────────────────────────────────────
-- A differenza di `support_touch_ticket_on_message`, qui non serve INVOKER →
-- DEFINER: il trigger non scrive su un'altra tabella, modifica NEW nella
-- stessa riga che il chiamante e' gia' autorizzato ad aggiornare (RLS
-- `has_permission('reservations.manage', activity_id)` in USING e WITH CHECK).
-- Nessun privilegio da elevare, quindi non si eleva.
--
-- `SET search_path TO ''` come da regola. Nessun riferimento a tabelle nel
-- corpo, quindi nessuna qualifica da aggiungere.
--
-- ACL e CREATE TRIGGER vivono in 20260829120003: `CREATE FUNCTION` +
-- `REVOKE`/`GRANT` nello stesso file fanno fallire `supabase db push` con
-- SQLSTATE 42601 (docs/patterns/storage-sql.md).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reset_reservation_reminder_on_reschedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
    -- IS DISTINCT FROM e non <>: le colonne sono NOT NULL oggi, ma un
    -- confronto che si comporta bene sui NULL non costa nulla e non lascia
    -- un buco se un domani lo schema cambia.
    IF NEW.reservation_date IS DISTINCT FROM OLD.reservation_date
       OR NEW.reservation_time IS DISTINCT FROM OLD.reservation_time
    THEN
        NEW.reminder_sent_at   := NULL;
        NEW.guest_confirmed_at := NULL;
    END IF;

    -- BEFORE trigger: il valore di ritorno E' la riga che verra' scritta.
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reset_reservation_reminder_on_reschedule() IS
    'Trigger BEFORE UPDATE su reservations: azzera reminder_sent_at e guest_confirmed_at quando cambiano reservation_date o reservation_time. Uno spostamento e'' un altro appuntamento: il promemoria va rimandato e la conferma del cliente non vale piu''. party_size, nome e note non azzerano nulla.';
