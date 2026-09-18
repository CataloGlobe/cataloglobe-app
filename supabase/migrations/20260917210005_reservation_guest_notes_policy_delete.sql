-- FASE 5.3 — svuotare la nota = cancellare la riga (CHECK vieta il vuoto).
-- Solo la propria sede: nessuna azione di gruppo, come sul profilo.
CREATE POLICY "Roles can delete guest notes of their activity"
  ON public.reservation_guest_notes
  FOR DELETE
  TO authenticated
  USING (public.has_permission('guests.manage', activity_id));
