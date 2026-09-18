-- FASE 5.3 — scrive chi ha `guests.manage` sulla sede della nota.
CREATE POLICY "Roles can insert guest notes of their activity"
  ON public.reservation_guest_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission('guests.manage', activity_id));
