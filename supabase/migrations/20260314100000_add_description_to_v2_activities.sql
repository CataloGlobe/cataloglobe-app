-- Migration: Add description column to v2_activities
alter table public.v2_activities
  add column if not exists description text null;
