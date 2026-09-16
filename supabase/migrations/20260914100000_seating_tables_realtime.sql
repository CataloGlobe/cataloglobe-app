-- 20260914100000_seating_tables_realtime.sql
--
-- Aggiunge public.seating_tables alla publication `supabase_realtime`.
--
-- Con 20260912140000 solo `seatings` era in publication: aprire, chiudere e
-- annullare una tavolata propagavano fra schede, ma SPOSTARLA da un tavolo
-- all'altro no — `set_seating_tables` scrive solo la ponte, e la riga di
-- `seatings` non cambia. Finché il gesto viveva nel drawer della
-- prenotazione era un buco raro; con il drawer della tavolata (walk-in) e
-- l'host che tocca i tavoli all'ingresso, si vede.
--
-- Migration gemella di 20260912140000, idempotente allo stesso modo.
--
-- La RLS di public.seating_tables è già in piedi (20260911100100):
--   - SELECT:               has_permission('seatings.read',   activity_id)
--   - INSERT/UPDATE/DELETE: has_permission('seatings.manage', activity_id)
-- La policy SELECT è ciò che fa arrivare i `postgres_changes` al
-- sottoscrittore: senza, il sintomo non sarebbe un errore ma un realtime che
-- "a volte non va". Verificata prima di scrivere questa migration.
--
-- Lato client: secondo binding sullo stesso canale di `useSeatingsRealtime`,
-- stesso refetch. `seating_reservations` resta fuori: la ponte cambia solo
-- insieme a `seatings` (apertura / annullo), che è già coperta.

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'seating_tables'
    ) then
        execute 'alter publication supabase_realtime add table public.seating_tables';
    end if;
end $$;
