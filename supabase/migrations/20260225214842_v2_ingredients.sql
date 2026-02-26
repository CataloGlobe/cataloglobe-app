begin;

-- =========================================
-- V2: INGREDIENTS
-- =========================================

-- 1. Create v2_ingredients table
create table if not exists public.v2_ingredients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.v2_tenants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Unique constraint with expression (lower name) per tenant
create unique index if not exists v2_ingredients_tenant_id_lower_name_key 
  on public.v2_ingredients(tenant_id, lower(name));

-- 2. Create v2_product_ingredients table
create table if not exists public.v2_product_ingredients (
  tenant_id uuid not null references public.v2_tenants(id) on delete cascade,
  product_id uuid not null references public.v2_products(id) on delete cascade,
  ingredient_id uuid not null references public.v2_ingredients(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, ingredient_id)
);

-- 3. Indexes
create index if not exists v2_ingredients_tenant_id_idx 
  on public.v2_ingredients(tenant_id);

create index if not exists v2_product_ingredients_tenant_id_idx 
  on public.v2_product_ingredients(tenant_id);

create index if not exists v2_product_ingredients_product_id_idx 
  on public.v2_product_ingredients(product_id);

-- 4. RLS per v2_ingredients
alter table public.v2_ingredients enable row level security;

create policy "Tenant can read own ingredients"
  on public.v2_ingredients for select
  using (tenant_id = auth.uid());

create policy "Tenant can insert own ingredients"
  on public.v2_ingredients for insert
  with check (tenant_id = auth.uid());

create policy "Tenant can update own ingredients"
  on public.v2_ingredients for update
  using (tenant_id = auth.uid())
  with check (tenant_id = auth.uid());

create policy "Tenant can delete own ingredients"
  on public.v2_ingredients for delete
  using (tenant_id = auth.uid());

-- 5. RLS per v2_product_ingredients
alter table public.v2_product_ingredients enable row level security;

create policy "Tenant can read own product ingredients"
  on public.v2_product_ingredients for select
  using (tenant_id = auth.uid());

create policy "Tenant can insert own product ingredients"
  on public.v2_product_ingredients for insert
  with check (tenant_id = auth.uid());

create policy "Tenant can update own product ingredients"
  on public.v2_product_ingredients for update
  using (tenant_id = auth.uid())
  with check (tenant_id = auth.uid());

create policy "Tenant can delete own product ingredients"
  on public.v2_product_ingredients for delete
  using (tenant_id = auth.uid());

commit;
