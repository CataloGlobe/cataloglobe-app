-- =========================================
-- Aggiorna il CHECK constraint su schedules.priority
-- da BETWEEN 1 AND 10 a BETWEEN 1 AND 40
-- Necessario per supportare il calcolo: level_base (1/11/21/31) + display_order (0–9)
-- =========================================

BEGIN;

ALTER TABLE schedules
  DROP CONSTRAINT IF EXISTS schedules_priority_range_check;

ALTER TABLE schedules
  ADD CONSTRAINT schedules_priority_range_check
  CHECK (priority BETWEEN 1 AND 40);

COMMIT;
