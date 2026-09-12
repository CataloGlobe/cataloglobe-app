-- 20260911115455_print_jobs_realtime.sql
--
-- Add public.print_jobs to the `supabase_realtime` publication so the admin
-- Dashboard > Ordini kanban can subscribe to postgres_changes (UPDATE) and
-- show a "Comanda non stampata" badge when a comanda job reaches `failed`.
--
-- Idempotent: skips the ALTER PUBLICATION when the table is already a
-- member of the publication. Same pattern as
-- 20260606120000_reservations_realtime.sql.
--
-- RLS is already in place on public.print_jobs (20260907210000):
--   - SELECT: has_permission('orders.read', activity_id)
--   - No INSERT/UPDATE/DELETE policy (writes are service_role only)
-- Realtime emits events only for rows the subscriber can SELECT, so the
-- existing activity-scoped permission boundary is preserved — identical
-- mechanism already relied upon for public.orders.

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'print_jobs'
    ) then
        execute 'alter publication supabase_realtime add table public.print_jobs';
    end if;
end $$;
