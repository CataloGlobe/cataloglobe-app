-- Migration: Add description to v2_activity_groups
alter table public.v2_activity_groups add column if not exists description text;
