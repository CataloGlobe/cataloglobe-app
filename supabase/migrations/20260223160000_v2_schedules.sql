begin;

-- =========================================
-- V2: SCHEDULES (new programming model)
-- =========================================
create table if not exists public.v2_schedules (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references public.v2_tenants(id)
    on delete cascade,

  rule_type text not null
    check (rule_type in ('layout', 'price', 'visibility')),

  target_type text not null
    check (target_type in ('activity', 'activity_group', 'catalog')),

  target_id uuid not null,

  priority integer not null default 10,
  enabled boolean not null default true,
  is_baseline boolean not null default false,

  time_mode text not null
    check (time_mode in ('always', 'window')),

  days_of_week integer[] null,
  time_from time null,
  time_to time null,
  start_at timestamptz null,
  end_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists v2_schedules_tenant_id_idx
  on public.v2_schedules (tenant_id);

create index if not exists v2_schedules_rule_type_idx
  on public.v2_schedules (rule_type);

create index if not exists v2_schedules_target_idx
  on public.v2_schedules (target_type, target_id);

create index if not exists v2_schedules_enabled_idx
  on public.v2_schedules (enabled);

create index if not exists v2_schedules_priority_idx
  on public.v2_schedules (priority);


-- =========================================
-- V2: SCHEDULE LAYOUT PAYLOAD
-- =========================================
create table if not exists public.v2_schedule_layout (
  id uuid primary key default gen_random_uuid(),

  schedule_id uuid not null
    references public.v2_schedules(id)
    on delete cascade,

  style_id uuid not null
    references public.v2_styles(id),

  catalog_id uuid null
    references public.v2_catalogs(id),

  created_at timestamptz not null default now()
);

create index if not exists v2_schedule_layout_schedule_id_idx
  on public.v2_schedule_layout (schedule_id);

commit;
