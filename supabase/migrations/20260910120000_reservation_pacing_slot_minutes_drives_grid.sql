-- =========================================
-- RESERVATIONS — Pacing per fascia oraria (aggiornamento commento, FASE 2)
-- =========================================
-- Sola documentazione: nessuna colonna, nessun vincolo, nessun dato tocca.
-- `20260831140000_add_reservation_pacing.sql` dichiarava
-- `reservation_pacing_slot_minutes` indipendente dal passo della griglia
-- oraria del modulo pubblico ("Sono cose diverse e restano separate"). Quella
-- decisione è stata rovesciata: il campo che il ristoratore vede — "Ampiezza
-- della fascia" — ora governa ENTRAMBE le cose, perché era l'unico che
-- vedeva e prometteva già di farlo. Le migration esistenti non si toccano:
-- questo file aggiorna solo il commento perché quello vecchio oggi dice il
-- falso.
--
-- Passo della griglia pubblica = `reservation_pacing_slot_minutes`
-- (`src/pages/ReservationPage/utils/reservationSlots.ts`, parametro
-- `stepMinutes`, letto da `activities.reservation_pacing_slot_minutes` nel
-- payload di `resolve-public-catalog`). Il picker ADMIN resta indipendente,
-- fisso a 15 (`SLOT_STEP_MIN`): i vincoli chiudono il canale online, mai
-- l'operatore.
--
-- Il bucket del pacing (helper `reservation_pacing_block`) non cambia:
-- resta ricalcolato a runtime da questo stesso valore, mai persistito su
-- riga — nessuna prenotazione esistente viene invalidata da un cambio del
-- passo.

BEGIN;

COMMENT ON COLUMN public.activities.reservation_pacing_slot_minutes IS
    'Ampiezza in minuti del bucket di pacing (15|30|60). Dalla FASE 2, governa ANCHE il passo della griglia oraria offerta dal modulo pubblico di prenotazione (src/pages/ReservationPage/utils/reservationSlots.ts). Il picker admin resta fisso a 15 minuti (SLOT_STEP_MIN), indipendente da questo valore.';

COMMIT;
