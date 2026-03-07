begin;

-- =========================================
-- V2: CATALOGS
-- =========================================
create table if not exists public.v2_catalogs (
  id uuid primary key,
  tenant_id uuid not null references public.v2_tenants(id) on delete restrict,

  name text not null,
  description text null,
  catalog_type text null,
  kind text null,
  style jsonb null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill catalogs
insert into public.v2_catalogs (
  id,
  tenant_id,
  name,
  description,
  catalog_type,
  kind,
  style,
  created_at,
  updated_at
)
select
  c.id,
  c.user_id as tenant_id,
  c.name,
  c.description,
  c.collection_type as catalog_type,
  c.kind,
  c.style,
  coalesce(c.created_at, now()),
  coalesce(c.updated_at, now())
from public.collections c
where c.user_id is not null
on conflict (id) do nothing;


-- =========================================
-- V2: CATALOG SECTIONS
-- =========================================
create table if not exists public.v2_catalog_sections (
  id uuid primary key,
  catalog_id uuid not null references public.v2_catalogs(id) on delete cascade,

  label text null,
  order_index integer not null default 0,
  base_category_id uuid null,

  created_at timestamptz not null default now()
);

-- Backfill sections
insert into public.v2_catalog_sections (
  id,
  catalog_id,
  label,
  order_index,
  base_category_id,
  created_at
)
select
  s.id,
  s.collection_id,
  s.label,
  coalesce(s.order_index, 0),
  s.base_category_id,
  now()
from public.collection_sections s
on conflict (id) do nothing;


-- =========================================
-- V2: CATALOG ITEMS (pivot)
-- =========================================
create table if not exists public.v2_catalog_items (
  id uuid primary key,
  catalog_id uuid not null references public.v2_catalogs(id) on delete cascade,
  section_id uuid not null references public.v2_catalog_sections(id) on delete cascade,
  product_id uuid not null references public.v2_products(id) on delete cascade,

  order_index integer not null default 0,
  visible boolean not null default true,

  created_at timestamptz not null default now()
);

-- Backfill pivot
insert into public.v2_catalog_items (
  id,
  catalog_id,
  section_id,
  product_id,
  order_index,
  visible,
  created_at
)
select
  ci.id,
  ci.collection_id,
  ci.section_id,
  ci.item_id,
  coalesce(ci.order_index, 0),
  coalesce(ci.visible, true),
  now()
from public.collection_items ci
on conflict (id) do nothing;

commit;