-- Retroactive cleanup: remove schedule_targets rows that point to
-- non-existent activities (orphaned by previous activity deletions
-- that did not include this cleanup step). Then disable schedules
-- left with zero targets and apply_to_all=false (matches the "draft"
-- definition in CLAUDE.md: a rule without targets cannot apply).
--
-- Bug context: schedule_targets has no physical FK to activities
-- (polymorphic target_id), so rows survived activity deletions until
-- the delete-business edge function was patched to clean them up
-- inline. This migration handles legacy data prior to the patch.
--
-- Expected impact (verified via audit): 1 row deleted, 1 schedule disabled.

BEGIN;

DELETE FROM public.schedule_targets st
WHERE st.target_type = 'activity'
  AND NOT EXISTS (
    SELECT 1 FROM public.activities a WHERE a.id = st.target_id
  );

UPDATE public.schedules s
SET enabled = false
WHERE s.apply_to_all = false
  AND NOT EXISTS (
    SELECT 1 FROM public.schedule_targets st WHERE st.schedule_id = s.id
  );

COMMIT;
