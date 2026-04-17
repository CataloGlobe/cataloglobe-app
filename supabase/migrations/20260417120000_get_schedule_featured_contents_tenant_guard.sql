-- =============================================================================
-- Fix cross-tenant data leak: get_schedule_featured_contents now requires
-- p_tenant_id and verifies that the schedule belongs to the requesting tenant.
-- Previous version allowed cross-tenant featured content leak when called
-- with service_role via Edge Functions.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Drop the old single-parameter function
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_schedule_featured_contents(uuid);

-- ---------------------------------------------------------------------------
-- 2. Create new function with tenant guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_schedule_featured_contents(
  p_schedule_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'slot',      sfc.slot,
        'sort_order', sfc.sort_order,
        'featured_content', jsonb_build_object(
          'id',                 fc.id,
          'internal_name',      fc.internal_name,
          'title',              fc.title,
          'subtitle',           fc.subtitle,
          'description',        fc.description,
          'media_id',           fc.media_id,
          'cta_text',           fc.cta_text,
          'cta_url',            fc.cta_url,
          'status',             fc.status,
          'layout_style',       fc.layout_style,
          'pricing_mode',       fc.pricing_mode,
          'bundle_price',       fc.bundle_price,
          'show_original_total', fc.show_original_total,
          'created_at',         fc.created_at,
          'updated_at',         fc.updated_at,
          'products', (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'sort_order', fcp.sort_order,
                  'note',       fcp.note,
                  'product', jsonb_build_object(
                    'id',          p.id,
                    'name',        p.name,
                    'description', p.description,
                    'base_price',  p.base_price,
                    'image_url',   p.image_url,
                    'option_groups', (
                      SELECT COALESCE(
                        jsonb_agg(
                          jsonb_build_object(
                            'group_kind', og.group_kind,
                            'values', (
                              SELECT COALESCE(
                                jsonb_agg(
                                  jsonb_build_object(
                                    'name',           ov.name,
                                    'absolute_price', ov.absolute_price
                                  )
                                ),
                                '[]'::jsonb
                              )
                              FROM public.product_option_values ov
                              WHERE ov.option_group_id = og.id
                            )
                          )
                        ),
                        '[]'::jsonb
                      )
                      FROM public.product_option_groups og
                      WHERE og.product_id = p.id
                    )
                  )
                )
                ORDER BY COALESCE(fcp.sort_order, 0), fcp.id
              ),
              '[]'::jsonb
            )
            FROM public.featured_content_products fcp
            JOIN public.products p ON p.id = fcp.product_id
            WHERE fcp.featured_content_id = fc.id
          )
        )
      )
      ORDER BY sfc.sort_order
    ),
    '[]'::jsonb
  )
  FROM public.schedule_featured_contents sfc
  JOIN public.featured_contents fc   ON fc.id  = sfc.featured_content_id
  JOIN public.schedules          s   ON s.id   = sfc.schedule_id
  JOIN public.tenants            t   ON t.id   = s.tenant_id
  WHERE sfc.schedule_id = p_schedule_id
    AND s.tenant_id     = p_tenant_id
    AND fc.tenant_id    = p_tenant_id
    AND fc.status       = 'published'
    AND t.deleted_at    IS NULL
$$;


-- ---------------------------------------------------------------------------
-- 3. Grant EXECUTE to anon, authenticated, service_role
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.get_schedule_featured_contents(uuid, uuid)
  TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4. Validation
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  fn_row record;
BEGIN
  SELECT p.prosecdef, p.provolatile
  INTO fn_row
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_schedule_featured_contents';

  IF fn_row IS NULL THEN
    RAISE EXCEPTION 'FAIL: public.get_schedule_featured_contents() non trovata.';
  END IF;

  IF NOT fn_row.prosecdef THEN
    RAISE EXCEPTION 'FAIL: get_schedule_featured_contents() non è SECURITY DEFINER.';
  END IF;

  IF fn_row.provolatile <> 's' THEN
    RAISE EXCEPTION 'FAIL: get_schedule_featured_contents() non è STABLE (got %).', fn_row.provolatile;
  END IF;

  RAISE NOTICE 'OK: get_schedule_featured_contents(uuid, uuid) — SECURITY DEFINER, STABLE confermato.';

  -- Verify old single-param signature was dropped
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_schedule_featured_contents'
      AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'FAIL: vecchia signature a 1 parametro ancora presente.';
  END IF;

  RAISE NOTICE 'OK: vecchia signature a 1 parametro rimossa.';
END $$;


COMMIT;
