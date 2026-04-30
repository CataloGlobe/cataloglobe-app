-- =============================================================================
-- products: notes JSONB column
-- =============================================================================
--
-- Adds a structured key-value notes field to products. Each note is a pair
-- {label, value}; products can hold up to 10 notes. Validation lives at the
-- application layer (validateProductNotes in src/services/supabase/products.ts):
-- max 10 items, label <= 100 chars (non-empty), value <= 500 chars.
--
-- No DB-level CHECK constraint:
-- - Keeps schema simple and avoids migration churn when validation thresholds
--   evolve.
-- - Service layer is the single source of truth.
-- - DB DEFAULT '[]'::jsonb guarantees `notes` is always a JSON array (never
--   null) so consumers can read it without nullability checks.
--
-- Refs: FASE_4a_PLAN.md sez. 1.3-1.5
-- =============================================================================

BEGIN;

ALTER TABLE public.products
    ADD COLUMN notes JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.products.notes IS
$$Structured key-value notes (array of {label, value}).
Application-layer validation enforces max 10 items, label <= 100 chars
(non-empty), value <= 500 chars. No DB-level CHECK to keep schema
simple; the service layer validateProductNotes() is the single source
of truth.$$;

COMMIT;
