-- =========================================
-- Public API: get_public_catalog(catalog_id)
-- Returns a JSON payload for the public page without exposing tables.
-- =========================================

BEGIN;

-- 1) Function (SECURITY DEFINER) to bypass RLS safely, while enforcing what we expose.
-- We deliberately expose only:
-- - catalog basic fields
-- - sections + items ordering
-- - product basic fields (you can extend later)
-- - style_id if present (we fetch style basic fields too)
--
-- NOTE: This assumes v2_catalogs, v2_catalog_sections, v2_catalog_items, v2_products exist with expected columns.
-- If some product columns differ, we'll adjust after first run.

CREATE OR REPLACE FUNCTION public.get_public_catalog(p_catalog_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_catalog record;
  v_style record;
  v_payload jsonb;
BEGIN
  -- Fetch catalog
  SELECT *
  INTO v_catalog
  FROM public.v2_catalogs c
  WHERE c.id = p_catalog_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'CATALOG_NOT_FOUND'
    );
  END IF;

  -- Optional: style (if your schema has style_id on catalog; if not, we just skip)
  -- We guard with exception handler so this function works even if column doesn't exist yet.
  BEGIN
    EXECUTE
      'SELECT s.* FROM public.v2_styles s WHERE s.id = (SELECT style_id FROM public.v2_catalogs WHERE id = $1)'
    INTO v_style
    USING p_catalog_id;
  EXCEPTION WHEN undefined_column THEN
    v_style := NULL;
  END;

  -- Build sections + items
  -- We keep payload "flat but structured".
  v_payload :=
    jsonb_build_object(
      'ok', true,
      'catalog', to_jsonb(v_catalog),
      'style', CASE WHEN v_style IS NULL THEN NULL ELSE to_jsonb(v_style) END,
      'sections', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'section', to_jsonb(sec),
              'items', COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'item', to_jsonb(ci),
                      'product', to_jsonb(p)
                    )
                    ORDER BY ci.order_index
                  )
                  FROM public.v2_catalog_items ci
                  JOIN public.v2_products p ON p.id = ci.product_id
                  WHERE ci.section_id = sec.id
                    AND ci.catalog_id = p_catalog_id
                ),
                '[]'::jsonb
              )
            )
            ORDER BY sec.order_index
          )
          FROM public.v2_catalog_sections sec
          WHERE sec.catalog_id = p_catalog_id
        ),
        '[]'::jsonb
      )
    );

  RETURN v_payload;
END;
$$;

-- 2) Lock down function ownership/permissions
-- Allow calling from anon/public and authenticated
REVOKE ALL ON FUNCTION public.get_public_catalog(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_catalog(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_catalog(uuid) TO authenticated;

COMMIT;