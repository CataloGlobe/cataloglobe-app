-- =============================================================================
-- Add business_subtype to tenants + migrate to food_beverage macro vertical
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add business_subtype column
-- ---------------------------------------------------------------------------

ALTER TABLE tenants
  ADD COLUMN business_subtype TEXT NULL;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_business_subtype_check
  CHECK (business_subtype IN ('restaurant', 'bar', 'pizzeria', 'cafe') OR business_subtype IS NULL);

-- ---------------------------------------------------------------------------
-- 2. Populate business_subtype from existing vertical_type
-- ---------------------------------------------------------------------------

UPDATE tenants SET business_subtype = 'restaurant' WHERE vertical_type = 'restaurant';
UPDATE tenants SET business_subtype = 'bar'        WHERE vertical_type = 'bar';
-- retail, hotel, generic → NULL (no subtype mapping)

-- ---------------------------------------------------------------------------
-- 3. Update vertical_type CHECK constraint to accept 'food_beverage'
-- ---------------------------------------------------------------------------

ALTER TABLE tenants DROP CONSTRAINT tenants_vertical_type_check;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_vertical_type_check
  CHECK (vertical_type IN ('food_beverage', 'restaurant', 'bar', 'retail', 'hotel', 'generic'));

-- ---------------------------------------------------------------------------
-- 4. Migrate all current tenants to food_beverage macro vertical
-- ---------------------------------------------------------------------------

UPDATE tenants
  SET vertical_type = 'food_beverage'
  WHERE vertical_type IN ('restaurant', 'bar', 'retail', 'generic');

-- ---------------------------------------------------------------------------
-- 5. Recreate get_user_tenants() with business_subtype
--    Drop view first (depends on the function), then drop + recreate function.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.user_tenants_view;
DROP FUNCTION IF EXISTS public.get_user_tenants();

CREATE FUNCTION public.get_user_tenants()
RETURNS TABLE (
  id                uuid,
  name              text,
  vertical_type     text,
  business_subtype  text,
  created_at        timestamptz,
  owner_user_id     uuid,
  user_role         text,
  logo_url          text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    t.id,
    t.name,
    t.vertical_type,
    t.business_subtype,
    t.created_at,
    t.owner_user_id,
    CASE
      WHEN t.owner_user_id = auth.uid() THEN 'owner'
      WHEN tm.role IS NOT NULL           THEN tm.role
      ELSE NULL
    END AS user_role,
    t.logo_url
  FROM public.tenants t
  LEFT JOIN public.tenant_memberships tm
    ON  tm.tenant_id = t.id
    AND tm.user_id   = auth.uid()
    AND tm.status    = 'active'
  WHERE t.deleted_at IS NULL
    AND (
      t.owner_user_id = auth.uid()
      OR tm.user_id IS NOT NULL
    )
$$;

REVOKE ALL ON FUNCTION public.get_user_tenants() FROM public;
GRANT EXECUTE ON FUNCTION public.get_user_tenants() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Rebuild user_tenants_view with business_subtype
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.user_tenants_view;

CREATE VIEW public.user_tenants_view AS
SELECT
  id,
  name,
  vertical_type,
  business_subtype,
  created_at,
  owner_user_id,
  user_role,
  logo_url
FROM public.get_user_tenants();

COMMIT;
