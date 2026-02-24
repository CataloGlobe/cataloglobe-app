begin;

-- =========================================
-- V2: PRODUCTS (from legacy items)
-- =========================================
create table if not exists public.v2_products (
  id uuid primary key,
  tenant_id uuid not null references public.v2_tenants(id) on delete restrict,

  name text not null,
  description text null,

  base_price numeric null,

  parent_product_id uuid null references public.v2_products(id) on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill products from legacy items
insert into public.v2_products (
  id,
  tenant_id,
  name,
  description,
  base_price,
  parent_product_id,
  created_at,
  updated_at
)
select
  i.id,
  i.user_id as tenant_id,
  coalesce(nullif(i.name, ''), 'Untitled product') as name,
  i.description,
  i.base_price,
  null as parent_product_id,
  coalesce(i.created_at, now()) as created_at,
  coalesce(i.updated_at, now()) as updated_at
from public.items i
where i.user_id is not null
on conflict (id) do nothing;

commit;