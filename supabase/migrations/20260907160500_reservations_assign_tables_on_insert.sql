-- =============================================================================
-- Trigger AFTER INSERT: ogni prenotazione nuova riceve i tavoli
-- =============================================================================
-- FOR EACH ROW, senza WHEN: qualunque INSERT è una richiesta di tavolo. Il
-- motore decide da solo se la prenotazione occupa (status pending |
-- confirmed | seated) o no (reason `inactive_status`, nessuna riga).
--
-- AFTER: il motore rilegge la riga dal DB. Gira dopo tutti i trigger BEFORE
-- della tabella (enforce_feature, link_guest, set_updated_at): la riga è
-- definitiva quando viene letta.
--
-- CREATE OR REPLACE TRIGGER (PG14+): un solo comando, idempotente
-- cross-env, senza DROP separato.
--
-- Da qui in poi l'assegnazione non dipende più dal canale: le due PERFORM in
-- place_online_reservation vengono rimosse in 20260907160700, DOPO questo
-- file, così non esiste una finestra in cui nessuno assegna.

CREATE OR REPLACE TRIGGER reservations_assign_tables_on_insert
    AFTER INSERT ON public.reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.reservations_assign_tables();
