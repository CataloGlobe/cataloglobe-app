-- ============================================================
-- Drop legacy catalog schema — Step 7C
-- ============================================================

-- overrides legacy
DROP TABLE IF EXISTS public.business_item_overrides CASCADE;

-- schedules legacy
DROP TABLE IF EXISTS public.business_collection_schedules CASCADE;

-- catalog structure
DROP TABLE IF EXISTS public.collection_items CASCADE;
DROP TABLE IF EXISTS public.collection_sections CASCADE;
DROP TABLE IF EXISTS public.collections CASCADE;

-- products legacy
DROP TABLE IF EXISTS public.items CASCADE;
DROP TABLE IF EXISTS public.item_categories CASCADE;