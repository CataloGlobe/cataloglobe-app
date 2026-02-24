begin;

-- =========================================
-- V2: SCHEDULE VISIBILITY OVERRIDES
-- =========================================
create table if not exists public.v2_schedule_visibility_overrides (
  id uuid primary key default gen_random_uuid(),

  schedule_id uuid not null
    references public.v2_schedules(id)
    on delete cascade,

  product_id uuid not null
    references public.v2_products(id)
    on delete cascade,

  visible boolean not null,

  created_at timestamptz not null default now(),

  unique (schedule_id, product_id)
);

create index if not exists v2_schedule_visibility_overrides_schedule_id_idx
  on public.v2_schedule_visibility_overrides (schedule_id);

create index if not exists v2_schedule_visibility_overrides_product_id_idx
  on public.v2_schedule_visibility_overrides (product_id);

commit;
