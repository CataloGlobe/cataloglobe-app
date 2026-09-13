-- 20260912140000_seatings_realtime.sql
--
-- Aggiunge public.seatings alla publication `supabase_realtime`, così la
-- schermata di servizio (Dashboard > Prenotazioni > Servizio) può
-- sottoscrivere `postgres_changes` (INSERT / UPDATE / DELETE) e vedere una
-- tavolata aperta da un altro tablet senza ricaricare.
--
-- Idempotente, sul modello di 20260606120000_reservations_realtime.sql: salta
-- l'ALTER PUBLICATION se la tabella è già membro.
--
-- La RLS di public.seatings è già in piedi (20260911100000):
--   - SELECT:               has_permission('seatings.read',   activity_id)
--   - INSERT/UPDATE/DELETE: has_permission('seatings.manage', activity_id)
-- Realtime emette eventi solo per le righe che il sottoscrittore può SELECT,
-- quindi il confine per sede resta quello.
--
-- Solo `seatings`, di proposito. `seating_tables` (lo spostamento di una
-- tavolata) e `seating_reservations` non sono incluse: le transizioni di
-- stato che contano per la vista di servizio — aprire, chiudere, annullare —
-- scrivono tutte su `seatings`, e le prenotazioni collegate hanno già il
-- proprio canale. Se lo spostamento cross-tablet servirà in tempo reale, sarà
-- una migration gemella di questa, non un'estensione silenziosa.

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'seatings'
    ) then
        execute 'alter publication supabase_realtime add table public.seatings';
    end if;
end $$;
