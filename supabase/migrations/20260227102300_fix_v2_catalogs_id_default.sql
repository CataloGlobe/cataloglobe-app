-- Fix: add DEFAULT gen_random_uuid() to id columns that were missing it.
-- These tables were created with backfill in mind (ids came from old tables),
-- but new inserts from the frontend don't supply an id, causing a NOT NULL violation.

alter table public.v2_catalogs
  alter column id set default gen_random_uuid();

alter table public.v2_catalog_sections
  alter column id set default gen_random_uuid();

alter table public.v2_catalog_items
  alter column id set default gen_random_uuid();
