begin;

-- =========================================
-- V2: ACTIVITY SCHEDULES
-- =========================================
create table if not exists public.v2_activity_schedules (
  id uuid primary key,

  activity_id uuid not null
    references public.v2_activities(id)
    on delete cascade,

  catalog_id uuid not null
    references public.v2_catalogs(id)
    on delete cascade,

  slot text null,
  days_of_week integer[] null,

  start_time time null,
  end_time time null,

  priority integer not null default 0,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill schedules from legacy
insert into public.v2_activity_schedules (
  id,
  activity_id,
  catalog_id,
  slot,
  days_of_week,
  start_time,
  end_time,
  priority,
  is_active,
  created_at,
  updated_at
)
select
  s.id,
  s.business_id as activity_id,
  s.collection_id as catalog_id,
  s.slot,
  s.days_of_week,
  s.start_time,
  s.end_time,
  coalesce(s.priority, 0),
  coalesce(s.is_active, true),
  coalesce(s.created_at, now()),
  coalesce(s.updated_at, now())
from public.business_collection_schedules s
on conflict (id) do nothing;

commit;