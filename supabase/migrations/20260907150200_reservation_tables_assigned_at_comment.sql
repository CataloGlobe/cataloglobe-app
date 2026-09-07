-- =========================================
-- RESERVATIONS — Assegnazione tavoli (3/7): commento `assigned_at`
-- =========================================

COMMENT ON COLUMN public.reservation_tables.assigned_at IS
    'Momento in cui la riga è stata scritta dall''assegnatario (motore o operatore). Le righe non si cancellano al cambio di stato della prenotazione: l''occupazione si deriva via join su reservations.status.';
