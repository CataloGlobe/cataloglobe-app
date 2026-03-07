begin;

-- =========================================
-- V2: PRODUCTS HARDENING
-- =========================================

-- 1. Missing Indexes
create index if not exists idx_v2_products_tenant
  on public.v2_products (tenant_id);

create index if not exists idx_v2_products_parent
  on public.v2_products (parent_product_id);

create index if not exists idx_v2_products_created
  on public.v2_products (created_at);

-- 2. Trigger Function: Constraints on variants
create or replace function public.trg_check_v2_product_variant()
returns trigger
language plpgsql
as $$
declare
  v_parent_tenant_id uuid;
  v_parent_parent_id uuid;
begin
  -- Only validate if it's being linked to a parent
  if new.parent_product_id is not null then
    
    -- Fetch the parent's data
    select tenant_id, parent_product_id
    into v_parent_tenant_id, v_parent_parent_id
    from public.v2_products
    where id = new.parent_product_id;

    -- If parent doesn't exist, foreign key constraint will catch it anyway, 
    -- but we check just to be safe before accessing vars.
    if not found then
      return new;
    end if;

    -- Rule A: Tenant consistency
    if new.tenant_id != v_parent_tenant_id then
      raise exception 'Cross-tenant variants are not allowed (child % != parent %).', new.tenant_id, v_parent_tenant_id
      using errcode = 'integrity_constraint_violation';
    end if;

    -- Rule B: No variant of variant
    if v_parent_parent_id is not null then
      raise exception 'Variants cannot have variants. Product % is already a variant.', new.parent_product_id
      using errcode = 'integrity_constraint_violation';
    end if;

  end if;

  return new;
end;
$$;

-- 3. Trigger Definition
drop trigger if exists check_v2_product_variant_trigger on public.v2_products;
create trigger check_v2_product_variant_trigger
  before insert or update on public.v2_products
  for each row
  execute function public.trg_check_v2_product_variant();

commit;
