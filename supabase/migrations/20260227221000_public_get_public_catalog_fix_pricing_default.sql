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
  SELECT *
  INTO v_catalog
  FROM public.v2_catalogs c
  WHERE c.id = p_catalog_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CATALOG_NOT_FOUND');
  END IF;

  BEGIN
    EXECUTE
      'SELECT s.* FROM public.v2_styles s WHERE s.id = (SELECT style_id FROM public.v2_catalogs WHERE id = $1)'
    INTO v_style
    USING p_catalog_id;
  EXCEPTION WHEN undefined_column THEN
    v_style := NULL;
  END;

  v_payload :=
    jsonb_build_object(
      'ok', true,
      'catalog', to_jsonb(v_catalog),
      'style', CASE WHEN v_style IS NULL THEN NULL ELSE to_jsonb(v_style) END,

      'featured_contents', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'featured', to_jsonb(fc),
              'products', COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'link', to_jsonb(fcp),
                      'product', to_jsonb(p)
                    )
                    ORDER BY COALESCE(fcp.sort_order, 0), fcp.created_at
                  )
                  FROM public.v2_featured_content_products fcp
                  JOIN public.v2_products p ON p.id = fcp.product_id
                  WHERE fcp.tenant_id = v_catalog.tenant_id
                    AND fcp.featured_content_id = fc.id
                ),
                '[]'::jsonb
              )
            )
            ORDER BY fc.created_at
          )
          FROM public.v2_featured_contents fc
          WHERE fc.tenant_id = v_catalog.tenant_id
        ),
        '[]'::jsonb
      ),

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
                      'product', to_jsonb(p),
                      'pricing',
                        (
                          WITH o AS (
                            SELECT spo.override_price, spo.show_original_price
                            FROM public.v2_schedule_price_overrides spo
                            JOIN public.v2_schedules s ON s.id = spo.schedule_id
                            WHERE spo.tenant_id = v_catalog.tenant_id
                              AND spo.product_id = p.id
                              AND s.enabled = true
                            ORDER BY spo.created_at DESC
                            LIMIT 1
                          )
                          SELECT jsonb_build_object(
                            'base_price', p.base_price,
                            'effective_price', COALESCE((SELECT override_price FROM o), p.base_price),
                            'has_override', ((SELECT override_price FROM o) IS NOT NULL),
                            'show_original_price', COALESCE((SELECT show_original_price FROM o), false),
                            'original_price',
                              CASE
                                WHEN (SELECT override_price FROM o) IS NOT NULL
                                  AND COALESCE((SELECT show_original_price FROM o), false)
                                THEN p.base_price
                                ELSE NULL
                              END
                          )
                        )
                    )
                    ORDER BY COALESCE(ccp.sort_order, 0), ccp.created_at
                  )
                  FROM public.v2_catalog_category_products ccp
                  JOIN public.v2_products p ON p.id = ccp.product_id
                  WHERE ccp.catalog_id = p_catalog_id
                    AND ccp.category_id = cat.id
                ),
                '[]'::jsonb
              )
            )
            ORDER BY COALESCE(cat.sort_order, 0), cat.created_at
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

REVOKE ALL ON FUNCTION public.get_public_catalog(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_catalog(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_catalog(uuid) TO authenticated;

COMMIT;