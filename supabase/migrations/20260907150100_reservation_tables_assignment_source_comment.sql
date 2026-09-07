-- =========================================
-- RESERVATIONS — Assegnazione tavoli (2/7): commento `assignment_source`
-- =========================================

COMMENT ON COLUMN public.reservation_tables.assignment_source IS
    'Chi ha scelto il tavolo. ''system'' = proposta del motore automatico, ricalcolabile (il motore la cancella e la rifà). ''manual'' = decisione dell''operatore, intoccabile: basta UNA riga manual sulla prenotazione perché l''intera assegnazione sia fissa e il motore non la ricalcoli.';
