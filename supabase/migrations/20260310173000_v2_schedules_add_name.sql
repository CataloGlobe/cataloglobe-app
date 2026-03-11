-- =========================================
-- V2: Add name column to v2_schedules
-- =========================================
-- The name column was previously added via Studio but never tracked in a
-- migration file. This migration makes it official so the service layer can
-- rely on it without the fallback retry mechanism.

ALTER TABLE public.v2_schedules
  ADD COLUMN IF NOT EXISTS name text;
