-- ============================================================
-- Drop legacy tag tables
-- ============================================================
-- These tables belonged to the legacy items system and are no
-- longer used after the V2 catalog migration.
-- ============================================================

DROP TABLE IF EXISTS public.item_tags CASCADE;
DROP TABLE IF EXISTS public.tags CASCADE;