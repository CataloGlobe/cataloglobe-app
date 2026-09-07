-- =============================================================================
-- Trigger AFTER UPDATE: riassegna quando cambiano data, ora o coperti
-- =============================================================================
-- Doppio filtro, come `reservations_reset_reminder_on_reschedule`
-- (20260829120003):
--   - `UPDATE OF reservation_date, reservation_time, party_size`: il trigger
--     esiste solo per gli UPDATE che nominano quelle colonne;
--   - `WHEN (... IS DISTINCT FROM ...)`: il corpo non gira se il valore non
--     cambia (un UPDATE che riscrive lo stesso orario non è un reschedule).
-- Il corpo ripete il confronto: la WHEN è un'ottimizzazione.
--
-- Nessun altro campo scatena la riassegnazione. I cambi di stato (conferma,
-- disdetta, no-show, ripristino) non toccano `reservation_tables`:
-- l'occupazione si deriva via join sullo status, e una disdetta annullata
-- ritrova i suoi tavoli.
--
-- Il motore protegge da solo le assegnazioni `manual` (esce con
-- `manual_assignment`): un reschedule su prenotazione fissata dall'operatore
-- lascia i tavoli dove sono, anche se ora sono in conflitto. È la decisione
-- dell'operatore, non del motore.

CREATE OR REPLACE TRIGGER reservations_assign_tables_on_reschedule
    AFTER UPDATE OF reservation_date, reservation_time, party_size
    ON public.reservations
    FOR EACH ROW
    WHEN (
        OLD.reservation_date IS DISTINCT FROM NEW.reservation_date
        OR OLD.reservation_time IS DISTINCT FROM NEW.reservation_time
        OR OLD.party_size IS DISTINCT FROM NEW.party_size
    )
    EXECUTE FUNCTION public.reservations_assign_tables();
