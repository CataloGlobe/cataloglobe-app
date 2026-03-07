begin;

-- Add image_url column to v2_products
alter table if exists public.v2_products 
  add column if not exists image_url text null;

-- Backfill from legacy items metadata
update public.v2_products p
set image_url = (i.metadata->>'image')
from public.items i
where p.id = i.id
  and i.metadata->>'image' is not null
  and p.image_url is null;

commit;
