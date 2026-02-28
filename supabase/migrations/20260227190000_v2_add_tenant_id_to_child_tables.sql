-- =========================================
-- V2: Add tenant_id to child / join tables
-- =========================================

BEGIN;

-- 1) Add nullable tenant_id columns first
ALTER TABLE public.v2_catalog_sections
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE public.v2_catalog_items
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE public.v2_schedule_layout
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE public.v2_schedule_price_overrides
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE public.v2_schedule_visibility_overrides
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE public.v2_activity_schedules
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE public.v2_activity_product_overrides
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- 2) Backfill tenant_id from parent tables

-- catalog_* -> catalogs
UPDATE public.v2_catalog_sections s
SET tenant_id = c.tenant_id
FROM public.v2_catalogs c
WHERE s.tenant_id IS NULL
  AND c.id = s.catalog_id;

UPDATE public.v2_catalog_items i
SET tenant_id = c.tenant_id
FROM public.v2_catalogs c
WHERE i.tenant_id IS NULL
  AND c.id = i.catalog_id;

-- schedule_* -> schedules
UPDATE public.v2_schedule_layout l
SET tenant_id = s.tenant_id
FROM public.v2_schedules s
WHERE l.tenant_id IS NULL
  AND s.id = l.schedule_id;

UPDATE public.v2_schedule_price_overrides p
SET tenant_id = s.tenant_id
FROM public.v2_schedules s
WHERE p.tenant_id IS NULL
  AND s.id = p.schedule_id;

UPDATE public.v2_schedule_visibility_overrides v
SET tenant_id = s.tenant_id
FROM public.v2_schedules s
WHERE v.tenant_id IS NULL
  AND s.id = v.schedule_id;

-- activity_* -> activities
UPDATE public.v2_activity_schedules a
SET tenant_id = act.tenant_id
FROM public.v2_activities act
WHERE a.tenant_id IS NULL
  AND act.id = a.activity_id;

UPDATE public.v2_activity_product_overrides o
SET tenant_id = act.tenant_id
FROM public.v2_activities act
WHERE o.tenant_id IS NULL
  AND act.id = o.activity_id;

-- 3) Safety checks (must be zero)
DO $$
DECLARE
  missing int;
BEGIN
  SELECT COUNT(*) INTO missing FROM public.v2_catalog_sections WHERE tenant_id IS NULL;
  IF missing <> 0 THEN RAISE EXCEPTION 'v2_catalog_sections: tenant_id backfill missing rows: %', missing; END IF;

  SELECT COUNT(*) INTO missing FROM public.v2_catalog_items WHERE tenant_id IS NULL;
  IF missing <> 0 THEN RAISE EXCEPTION 'v2_catalog_items: tenant_id backfill missing rows: %', missing; END IF;

  SELECT COUNT(*) INTO missing FROM public.v2_schedule_layout WHERE tenant_id IS NULL;
  IF missing <> 0 THEN RAISE EXCEPTION 'v2_schedule_layout: tenant_id backfill missing rows: %', missing; END IF;

  SELECT COUNT(*) INTO missing FROM public.v2_schedule_price_overrides WHERE tenant_id IS NULL;
  IF missing <> 0 THEN RAISE EXCEPTION 'v2_schedule_price_overrides: tenant_id backfill missing rows: %', missing; END IF;

  SELECT COUNT(*) INTO missing FROM public.v2_schedule_visibility_overrides WHERE tenant_id IS NULL;
  IF missing <> 0 THEN RAISE EXCEPTION 'v2_schedule_visibility_overrides: tenant_id backfill missing rows: %', missing; END IF;

  SELECT COUNT(*) INTO missing FROM public.v2_activity_schedules WHERE tenant_id IS NULL;
  IF missing <> 0 THEN RAISE EXCEPTION 'v2_activity_schedules: tenant_id backfill missing rows: %', missing; END IF;

  SELECT COUNT(*) INTO missing FROM public.v2_activity_product_overrides WHERE tenant_id IS NULL;
  IF missing <> 0 THEN RAISE EXCEPTION 'v2_activity_product_overrides: tenant_id backfill missing rows: %', missing; END IF;
END $$;

-- 4) Enforce NOT NULL (now that backfill is done)
ALTER TABLE public.v2_catalog_sections
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.v2_catalog_items
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.v2_schedule_layout
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.v2_schedule_price_overrides
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.v2_schedule_visibility_overrides
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.v2_activity_schedules
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.v2_activity_product_overrides
  ALTER COLUMN tenant_id SET NOT NULL;

-- 5) Helpful indexes (RLS + filtering)
CREATE INDEX IF NOT EXISTS idx_v2_catalog_sections_tenant_id
  ON public.v2_catalog_sections (tenant_id);

CREATE INDEX IF NOT EXISTS idx_v2_catalog_items_tenant_id
  ON public.v2_catalog_items (tenant_id);

CREATE INDEX IF NOT EXISTS idx_v2_schedule_layout_tenant_id
  ON public.v2_schedule_layout (tenant_id);

CREATE INDEX IF NOT EXISTS idx_v2_schedule_price_overrides_tenant_id
  ON public.v2_schedule_price_overrides (tenant_id);

CREATE INDEX IF NOT EXISTS idx_v2_schedule_visibility_overrides_tenant_id
  ON public.v2_schedule_visibility_overrides (tenant_id);

CREATE INDEX IF NOT EXISTS idx_v2_activity_schedules_tenant_id
  ON public.v2_activity_schedules (tenant_id);

CREATE INDEX IF NOT EXISTS idx_v2_activity_product_overrides_tenant_id
  ON public.v2_activity_product_overrides (tenant_id);

COMMIT;