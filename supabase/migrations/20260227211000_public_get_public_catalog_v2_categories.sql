-- =========================================
-- Public API: get_public_catalog(catalog_id) v2
-- Uses v2_catalog_categories + v2_catalog_category_products (the model actually populated)
-- =========================================

BEGIN;

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
    RETURN jsonb_build_object('ok', false, 'error', 'CATALOG_NOT_FOUND');
  END IF;

  -- Optional: style (if your schema has style_id on catalog)
  BEGIN
    EXECUTE
      'SELECT s.* FROM public.v2_styles s WHERE s.id = (SELECT style_id FROM public.v2_catalogs WHERE id = $1)'
    INTO v_style
    USING p_catalog_id;
  EXCEPTION WHEN undefined_column THEN
    v_style := NULL;
  END;

  -- Build categories with products
  v_payload :=
    jsonb_build_object(
      'ok', true,
      'catalog', to_jsonb(v_catalog),
      'style', CASE WHEN v_style IS NULL THEN NULL ELSE to_jsonb(v_style) END,
      'categories', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'category', to_jsonb(cat),
              'products', COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'link', to_jsonb(ccp),
                      'product', to_jsonb(p)
                    )
                    -- If you later add an order_index on ccp, change ORDER BY accordingly.
                  )
                  FROM public.v2_catalog_category_products ccp
                  JOIN public.v2_products p ON p.id = ccp.product_id
                  WHERE ccp.catalog_id = p_catalog_id
                    AND ccp.category_id = cat.id
                ),
                '[]'::jsonb
              )
            )
            -- If you have order_index on categories, keep it; otherwise created_at.
            ORDER BY COALESCE(cat.order_index, 0)
          )
          FROM public.v2_catalog_categories cat
          WHERE cat.catalog_id = p_catalog_id
            AND cat.parent_category_id IS NULL
        ),
        '[]'::jsonb
      )
    );

  RETURN v_payload;
END;
$$;

-- permissions (keep as before)
REVOKE ALL ON FUNCTION public.get_public_catalog(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_catalog(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_catalog(uuid) TO authenticated;

COMMIT;