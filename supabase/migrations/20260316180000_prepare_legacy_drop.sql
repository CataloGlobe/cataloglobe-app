-- ============================================================
-- Prepare legacy drop — Step 7B
-- ============================================================

-- 1) View
DROP VIEW IF EXISTS public.businesses_with_capabilities CASCADE;

-- ============================================================
-- 2) TRIGGERS that depend on legacy functions
-- ============================================================

DROP TRIGGER IF EXISTS trg_delete_empty_collection_sections
ON public.collection_items;

DROP TRIGGER IF EXISTS trg_enforce_collection_item_section_category
ON public.collection_items;

DROP TRIGGER IF EXISTS trg_validate_days_of_week
ON public.business_collection_schedules;

-- ============================================================
-- 3) Functions
-- ============================================================

DROP FUNCTION IF EXISTS public.duplicate_collection(uuid, text);
DROP FUNCTION IF EXISTS public.duplicate_collection(uuid, text, boolean);

DROP FUNCTION IF EXISTS public.delete_empty_collection_sections();
DROP FUNCTION IF EXISTS public.enforce_collection_item_section_category();
DROP FUNCTION IF EXISTS public.validate_days_of_week();

-- ============================================================
-- 4) RLS policy referencing items
-- ============================================================

DROP POLICY IF EXISTS item_tags_owner_only
ON public.item_tags;