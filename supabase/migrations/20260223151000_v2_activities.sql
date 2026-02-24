begin;

-- =========================================
-- V2: ACTIVITIES (from legacy businesses)
-- =========================================
create table if not exists public.v2_activities (
  id uuid primary key,
  tenant_id uuid not null references public.v2_tenants(id) on delete restrict,

  name text not null,
  slug text not null,
  activity_type text null,

  address text null,
  city text null,
  cover_image text null,

  status text not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (tenant_id, slug)
);

-- Backfill activities keeping same IDs as businesses.id
insert into public.v2_activities (
  id, tenant_id, name, slug, activity_type,
  address, city, cover_image,
  status, created_at, updated_at
)
select
  b.id,
  b.user_id as tenant_id,
  coalesce(nullif(b.name, ''), 'Untitled activity') as name,
  coalesce(nullif(b.slug, ''), b.id::text) as slug,
  b.type as activity_type,

  b.address,
  b.city,
  b.cover_image,

  'active' as status,
  coalesce(b.created_at, now()) as created_at,
  now() as updated_at
from public.businesses b
where b.user_id is not null
on conflict (id) do nothing;

commit;