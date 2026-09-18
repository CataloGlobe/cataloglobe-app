-- FASE 5.3 — USING e WITH CHECK identici: non si sposta una nota su
-- un'altra sede riscrivendo `activity_id`.
CREATE POLICY "Roles can update guest notes of their activity"
  ON public.reservation_guest_notes
  FOR UPDATE
  TO authenticated
  USING (public.has_permission('guests.manage', activity_id))
  WITH CHECK (public.has_permission('guests.manage', activity_id));
