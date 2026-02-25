begin;

-- =========================================
-- V2: STYLE VERSIONS (Step 4)
-- =========================================
create table if not exists public.v2_style_versions (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references public.v2_tenants(id)
    on delete cascade,

  style_id uuid not null
    references public.v2_styles(id)
    on delete cascade,

  version integer not null,
  config jsonb not null,

  created_at timestamptz not null default now()
);

create index if not exists v2_style_versions_tenant_id_idx
  on public.v2_style_versions (tenant_id);

create index if not exists v2_style_versions_style_id_idx
  on public.v2_style_versions (style_id);

-- Alter v2_styles to include current_version_id
alter table public.v2_styles
  add column if not exists current_version_id uuid references public.v2_style_versions(id);

commit;
