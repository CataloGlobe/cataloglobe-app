-- 20260606120000_reservations_realtime.sql
--
-- Add public.reservations to the `supabase_realtime` publication so the
-- admin Dashboard > Prenotazioni list can subscribe to postgres_changes
-- (INSERT / UPDATE / DELETE) for live updates.
--
-- Idempotent: skips the ALTER PUBLICATION when the table is already a
-- member of the publication. Useful when re-applying on a branch that
-- already had it added manually via Studio.
--
-- RLS is already in place on public.reservations:
--   - SELECT: has_permission('reservations.read', activity_id)
--   - INSERT/UPDATE/DELETE: has_permission('reservations.manage', activity_id)
-- Realtime emits events only for rows the subscriber can SELECT, so the
-- existing activity-scoped permission boundary is preserved.

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'reservations'
    ) then
        execute 'alter publication supabase_realtime add table public.reservations';
    end if;
end $$;
