begin;

-- =========================================
-- V2: STYLES (base)
-- =========================================
create table if not exists public.v2_styles (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references public.v2_tenants(id)
    on delete cascade,

  name text not null,
  is_system boolean not null default false,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists v2_styles_tenant_id_idx
  on public.v2_styles (tenant_id);

create index if not exists v2_styles_is_active_idx
  on public.v2_styles (is_active);

commit;
