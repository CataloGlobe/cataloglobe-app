COMMENT ON TABLE public.reservation_guest_notes IS
  'Nota del locale su un ospite, PER SEDE (FASE 5.3). I fatti (identita'', contatori) restano in reservation_guests, scope azienda; il giudizio scritto resta nella sede che lo ha scritto. RLS: has_permission(guests.read|guests.manage, activity_id). Una riga per (guest_id, activity_id); vuota = cancellata.';
