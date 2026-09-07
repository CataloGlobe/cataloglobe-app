-- =========================================
-- RESERVATIONS — Assegnazione tavoli (1/7): stato della riga di ponte
-- =========================================
-- `reservation_tables` finora diceva solo QUALI tavoli; da qui dice anche
-- CHI li ha scelti. Due colonne in un unico ALTER (un comando per file:
-- `db push` invia ogni file come singolo prepared statement).
--
-- `assignment_source`:
--   'system' → proposta del motore automatico. Ricalcolabile: il motore la
--              cancella e la rifà quando serve.
--   'manual' → decisione dell'operatore. Intoccabile: se anche UNA sola riga
--              della prenotazione è 'manual', l'intera assegnazione è fissa e
--              il motore non la ricalcola.
--
-- `assigned_at`: quando la riga è stata scritta. Distinto da `created_at`
-- solo per intenzione semantica (il ricalcolo 'system' cancella e reinserisce,
-- quindi coincidono; su una futura promozione a 'manual' via UPDATE potranno
-- divergere).
--
-- Le righe NON si cancellano mai al cambio di stato della prenotazione:
-- l'occupazione si deriva sempre via join su `reservations.status`. Una
-- disdetta annullata ritrova i suoi tavoli senza riassegnazione.

ALTER TABLE public.reservation_tables
    ADD COLUMN assignment_source text NOT NULL DEFAULT 'system'
        CONSTRAINT reservation_tables_assignment_source_check
        CHECK (assignment_source IN ('system', 'manual')),
    ADD COLUMN assigned_at timestamptz NOT NULL DEFAULT now();
