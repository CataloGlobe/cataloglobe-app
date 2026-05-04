-- =============================================================================
-- product_characteristics: drop unused show_in_card column
-- =============================================================================
--
-- The column was introduced in Fase 1b as a platform-side curation flag for
-- which characteristics to render in card vs detail. Fase 5 replaced this
-- model with a unified rendering policy: all assigned characteristics
-- appear in card, capped by MAX_CHARACTERISTIC_EMOJIS (= 6) with "+N"
-- overflow.
--
-- The column has had no consumer since Fase 5; this migration drops it for
-- schema cleanliness. If a similar flag is needed in the future, it can be
-- re-added with a new ADD COLUMN migration without conflicts.
--
-- Refs: FASE_5b_PLAN.md
-- =============================================================================

BEGIN;

ALTER TABLE public.product_characteristics
    DROP COLUMN IF EXISTS show_in_card;

COMMIT;
