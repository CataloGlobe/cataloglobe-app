-- =========================================
-- RESERVATIONS — Assegnazione tavoli (7/7): via la colonna legacy
-- =========================================
-- `reservations.table_id` (20260615140000) è nata come assegnazione singola e
-- non è mai stata usata: 0 righe valorizzate in staging (verificato il
-- 2026-09-07: 26 prenotazioni, 0 con table_id), nessun lettore né scrittore in
-- `src/` o `supabase/functions/` (l'unica occorrenza è un test che ne asserisce
-- l'ASSENZA dal payload pubblico di cancel-reservation-public). La verità è
-- `reservation_tables` (molti-a-molti), come dichiarato in 20260907120200.
--
-- Migration isolata, ultima della serie: il DROP COLUMN è irreversibile e
-- merita il suo momento di verifica. `database.types.ts` va rigenerato dopo
-- l'applicazione (Row/Insert/Update di `reservations` perdono `table_id`).
--
-- La FK `reservations_table_id_fkey` (ON DELETE SET NULL) cade insieme alla
-- colonna: nessun altro vincolo dipende da essa.

ALTER TABLE public.reservations DROP COLUMN IF EXISTS table_id;
