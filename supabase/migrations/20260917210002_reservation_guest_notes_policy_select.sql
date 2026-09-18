-- FASE 5.3 — chi ha `guests.read` SULLA SEDE legge la nota di quella sede.
-- Non `has_permission_any_activity`: e' proprio il confine che si vuole.
CREATE POLICY "Roles can read guest notes of their activity"
  ON public.reservation_guest_notes
  FOR SELECT
  TO authenticated
  USING (public.has_permission('guests.read', activity_id));
