begin;

-- =========================================
-- V2: ACTIVITY PRODUCT OVERRIDES
-- =========================================
create table if not exists public.v2_activity_product_overrides (
  id uuid primary key,

  activity_id uuid not null
    references public.v2_activities(id)
    on delete cascade,

  product_id uuid not null
    references public.v2_products(id)
    on delete cascade,

  price_override numeric null,
  visible_override boolean null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (activity_id, product_id)
);

-- Backfill overrides from legacy table
insert into public.v2_activity_product_overrides (
  id,
  activity_id,
  product_id,
  price_override,
  visible_override,
  created_at,
  updated_at
)
select
  o.id,
  o.business_id as activity_id,
  o.item_id as product_id,
  o.price_override,
  o.visible_override,
  coalesce(o.created_at, now()),
  coalesce(o.updated_at, now())
from public.business_item_overrides o
on conflict (id) do nothing;

commit;