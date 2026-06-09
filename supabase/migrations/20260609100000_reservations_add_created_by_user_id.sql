-- Mirror of orders.created_by_user_id (migration 20260607131833) for the
-- reservations table. Difference: this column carries DEFAULT auth.uid()
-- because reservations are inserted in two different identity contexts:
--   - createReservation (admin dashboard) → direct INSERT under the
--     authenticated user's JWT → auth.uid() resolves to the operator.
--   - place_online_reservation RPC (customer form) → SECURITY DEFINER
--     invoked by submit-reservation edge function as service_role →
--     auth.uid() is NULL, leaving created_by_user_id = NULL (intended).
--
-- The DEFAULT keeps the service layer untouched and avoids client-side
-- forging (the value is never read from the request payload).

ALTER TABLE public.reservations
  ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
  DEFAULT auth.uid();

COMMENT ON COLUMN public.reservations.created_by_user_id IS
  'Operatore (auth.users) che ha creato la prenotazione manualmente. NULL per le prenotazioni online (place_online_reservation gira come service_role → auth.uid() NULL).';
