-- Migrazione per collegare i Contenuti in evidenza al Rule Engine Layout (Step 2)

create table if not exists public.v2_schedule_featured_contents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.v2_tenants(id) on delete restrict,
  schedule_id uuid not null references public.v2_schedules(id) on delete cascade,
  featured_content_id uuid not null references public.v2_featured_contents(id) on delete cascade,
  slot text not null check (slot in ('hero','before_catalog','after_catalog')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  unique(schedule_id, featured_content_id)
);

create index if not exists idx_v2_sched_feat_cont_schedule
  on public.v2_schedule_featured_contents (schedule_id);

create index if not exists idx_v2_sched_feat_cont_featured
  on public.v2_schedule_featured_contents (featured_content_id);

create index if not exists idx_v2_sched_feat_cont_tenant
  on public.v2_schedule_featured_contents (tenant_id);


