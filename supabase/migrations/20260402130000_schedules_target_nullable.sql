BEGIN;

ALTER TABLE schedules
  ALTER COLUMN target_type DROP NOT NULL,
  ALTER COLUMN target_id   DROP NOT NULL;

-- Rimuovi il CHECK constraint esistente su target_type
-- e ricrealo accettando anche NULL
ALTER TABLE schedules
  DROP CONSTRAINT IF EXISTS schedules_target_type_check;

ALTER TABLE schedules
  ADD CONSTRAINT schedules_target_type_check
  CHECK (target_type IS NULL OR target_type IN ('activity', 'activity_group', 'catalog'));

COMMIT;
