-- Add 'featured' to schedules.rule_type CHECK constraint

ALTER TABLE public.schedules
  DROP CONSTRAINT IF EXISTS v2_schedules_rule_type_check;

ALTER TABLE public.schedules
  ADD CONSTRAINT schedules_rule_type_check
  CHECK (rule_type IN ('layout', 'price', 'visibility', 'featured'));
