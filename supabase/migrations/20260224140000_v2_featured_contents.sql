begin;

-- =========================================
-- V2: FEATURED CONTENTS
-- =========================================
create table if not exists public.v2_featured_contents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.v2_tenants(id) on delete restrict,

  title text not null,
  subtitle text null,
  description text null,
  cover_image_url text null,
  type text not null check (type in ('informative', 'composite')),
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_v2_featured_contents_tenant
  on public.v2_featured_contents (tenant_id);



-- =========================================
-- V2: FEATURED CONTENT PRODUCTS
-- =========================================
create table if not exists public.v2_featured_content_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.v2_tenants(id) on delete restrict,
  featured_content_id uuid not null references public.v2_featured_contents(id) on delete cascade,
  product_id uuid not null references public.v2_products(id) on delete restrict,

  sort_order integer not null default 0,
  note text null,

  created_at timestamptz not null default now(),

  unique(featured_content_id, product_id)
);

create index if not exists idx_v2_featured_content_products_featured
  on public.v2_featured_content_products (featured_content_id);

create index if not exists idx_v2_featured_content_products_product
  on public.v2_featured_content_products (product_id);

create index if not exists idx_v2_featured_content_products_tenant
  on public.v2_featured_content_products (tenant_id);

commit;