begin;

-- =========================================
-- V2: TENANTS (minimal)
-- =========================================
create table if not exists public.v2_tenants (
  id uuid primary key,
  name text not null,
  vertical_type text not null default 'generic',
  created_at timestamptz not null default now()
);

-- Backfill tenants from legacy businesses.user_id
-- (1 tenant per user_id)
insert into public.v2_tenants (id, name, vertical_type)
select
  b.user_id as id,
  coalesce(nullif(max(b.name), ''), 'Tenant') as name,
  'generic' as vertical_type
from public.businesses b
where b.user_id is not null
group by b.user_id
on conflict (id) do nothing;

commit;