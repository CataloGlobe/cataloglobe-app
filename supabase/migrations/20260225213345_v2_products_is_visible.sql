begin;

-- Add missing is_visible column to v2_products
alter table if exists public.v2_products 
  add column if not exists is_visible boolean not null default true;

commit;
