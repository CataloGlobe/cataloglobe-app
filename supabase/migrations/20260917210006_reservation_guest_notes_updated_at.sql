-- FASE 5.3 — stesso trigger di `reservation_guests` (funzione gia' esistente,
-- nessuna CREATE FUNCTION qui).
CREATE TRIGGER reservation_guest_notes_set_updated_at
  BEFORE UPDATE ON public.reservation_guest_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
