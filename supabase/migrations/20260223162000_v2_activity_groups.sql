begin;

-- =========================================
-- V2: ACTIVITY GROUPS
-- =========================================
create table if not exists public.v2_activity_groups (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references public.v2_tenants(id)
    on delete cascade,

  name text not null,
  is_system boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (tenant_id, name)
);

create index if not exists v2_activity_groups_tenant_id_idx
  on public.v2_activity_groups (tenant_id);

-- =========================================
-- V2: ACTIVITY GROUP MEMBERS
-- =========================================
create table if not exists public.v2_activity_group_members (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references public.v2_tenants(id)
    on delete cascade,

  group_id uuid not null
    references public.v2_activity_groups(id)
    on delete cascade,

  activity_id uuid not null
    references public.v2_activities(id)
    on delete cascade,

  created_at timestamptz not null default now(),

  unique (group_id, activity_id)
);

create index if not exists v2_activity_group_members_group_id_idx
  on public.v2_activity_group_members (group_id);

create index if not exists v2_activity_group_members_activity_id_idx
  on public.v2_activity_group_members (activity_id);

commit;
