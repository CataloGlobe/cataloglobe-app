-- Il WHEN ripete la condizione della funzione: così il trigger non parte
-- nemmeno per gli UPDATE che non lo riguardano (promemoria, tavoli, note).
CREATE TRIGGER reservations_bump_ics_sequence
    BEFORE UPDATE ON public.reservations
    FOR EACH ROW
    WHEN (
        OLD.reservation_date IS DISTINCT FROM NEW.reservation_date
        OR OLD.reservation_time IS DISTINCT FROM NEW.reservation_time
        OR OLD.status IS DISTINCT FROM NEW.status
    )
    EXECUTE FUNCTION public.bump_reservation_ics_sequence();
