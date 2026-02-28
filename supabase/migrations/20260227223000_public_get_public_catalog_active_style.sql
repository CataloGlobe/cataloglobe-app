-- =========================================
-- get_public_catalog(): determine active style from schedules + schedule_layout
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

  v_active_layout record;
  v_active_schedule record;

  v_payload jsonb;
BEGIN
  SELECT *
  INTO v_catalog
  FROM public.v2_catalogs c
  WHERE c.id = p_catalog_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CATALOG_NOT_FOUND');
  END IF;

  -- 1) Pick best active layout for this catalog
  SELECT sl.*
  INTO v_active_layout
  FROM public.v2_schedule_layout sl
  JOIN public.v2_schedules s ON s.id = sl.schedule_id
  WHERE sl.tenant_id = v_catalog.tenant_id
    AND s.tenant_id = v_catalog.tenant_id
    AND s.enabled = true
    AND (sl.catalog_id = p_catalog_id OR sl.catalog_id IS NULL)
  ORDER BY
    (sl.catalog_id = p_catalog_id) DESC,
    s.priority DESC,
    s.created_at DESC,
    sl.created_at DESC
  LIMIT 1;

  -- 2) Load schedule row for debug + potential future logic
  IF v_active_layout IS NOT NULL THEN
    SELECT s.*
    INTO v_active_schedule
    FROM public.v2_schedules s
    WHERE s.id = v_active_layout.schedule_id;
  ELSE
    v_active_schedule := NULL;
  END IF;

  -- 3) Load style (if we have layout)
  IF v_active_layout IS NOT NULL THEN
    SELECT st.*
    INTO v_style
    FROM public.v2_styles st
    WHERE st.id = v_active_layout.style_id;
  ELSE
    v_style := NULL;
  END IF;

  -- 4) Build payload (same as before, but style now resolved)
  v_payload :=
    jsonb_build_object(
      'ok', true,
      'catalog', to_jsonb(v_catalog),

      -- Debug helpers (safe to keep; frontend can ignore)
      'active_schedule', CASE WHEN v_active_schedule IS NULL THEN NULL ELSE to_jsonb(v_active_schedule) END,
      'active_layout', CASE WHEN v_active_layout IS NULL THEN NULL ELSE to_jsonb(v_active_layout) END,

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