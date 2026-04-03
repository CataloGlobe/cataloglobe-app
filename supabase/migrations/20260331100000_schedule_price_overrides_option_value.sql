begin;

-- 1. Add nullable option_value_id
alter table public.schedule_price_overrides
  add column if not exists option_value_id uuid
    references public.product_option_values(id) on delete cascade;

-- 2. Drop old unique constraint (try both names safely)
alter table public.schedule_price_overrides
  drop constraint if exists schedule_price_overrides_schedule_id_product_id_key;

alter table public.schedule_price_overrides
  drop constraint if exists v2_schedule_price_overrides_schedule_id_product_id_key;

-- 3. Product-level uniqueness
create unique index if not exists uq_spo_schedule_product_no_value
  on public.schedule_price_overrides (schedule_id, product_id)
  where option_value_id is null;

-- 4. Value-level uniqueness
create unique index if not exists uq_spo_schedule_product_value
  on public.schedule_price_overrides (schedule_id, product_id, option_value_id)
  where option_value_id is not null;

commit;