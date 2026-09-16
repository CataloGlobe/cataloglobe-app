-- =============================================================================
-- bump_reservation_ics_sequence() — trigger BEFORE UPDATE su reservations
-- =============================================================================
-- Incrementa `ics_sequence` quando il cambiamento invalida l'evento nel
-- calendario del cliente (RFC 5546 §2.1.4):
--   - cambia reservation_date o reservation_time  → DTSTART/DTEND diversi;
--   - lo status ENTRA in cancelled o declined      → STATUS:CANCELLED.
-- Nient'altro: coperti, contatti, note, tavoli, promemoria non toccano il
-- numero. Un incremento gratuito farebbe "saltare" l'evento nei client senza
-- che sia cambiato niente di visibile.
--
-- BEFORE e non AFTER: il valore scritto è quello che la Edge rilegge con
-- `.select()` subito dopo l'UPDATE e mette nell'allegato — un solo numero,
-- nella stessa transazione, per qualunque scrittore (update-reservation,
-- respond-reservation, cancel-reservation-public, Studio).
--
-- SECURITY INVOKER: gira con i privilegi di chi fa l'UPDATE, che la RLS ha
-- già autorizzato. Non eleva niente. Convive con
-- `reset_reservation_reminder_on_reschedule` (stesso evento, colonne
-- diverse, ordine indifferente).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.bump_reservation_ics_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
    IF NEW.reservation_date IS DISTINCT FROM OLD.reservation_date
       OR NEW.reservation_time IS DISTINCT FROM OLD.reservation_time
       OR (NEW.status IN ('cancelled', 'declined')
           AND NEW.status IS DISTINCT FROM OLD.status)
    THEN
        NEW.ics_sequence := COALESCE(OLD.ics_sequence, 0) + 1;
    END IF;

    RETURN NEW;
END;
$$;
