-- =========================================
-- get_public_catalog(): include product option groups + values
-- Uses the SECURITY DEFINER function already set up — no new public RLS needed.
-- Adds "options" array to each product in categories and featured_contents.
-- Adds "from_price" to pricing (min absolute_price when PRIMARY_PRICE group exists).
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
    AND public.is_schedule_active(s)
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

  -- 4) Build payload with options included per-product
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
                      'product', to_jsonb(p),
                      'options', (
                        SELECT COALESCE(
                          jsonb_agg(
                            jsonb_build_object(
                              'group', jsonb_build_object(
                                'id', og.id,
                                'name', og.name,
                                'group_kind', og.group_kind,
                                'pricing_mode', og.pricing_mode,
                                'is_required', og.is_required,
                                'max_selectable', og.max_selectable
                              ),
                              'values', COALESCE(
                                (
                                  SELECT jsonb_agg(
                                    jsonb_build_object(
                                      'id', ov.id,
                                      'name', ov.name,
                                      'absolute_price', ov.absolute_price,
                                      'price_modifier', ov.price_modifier
                                    )
                                    ORDER BY ov.created_at
                                  )
                                  FROM public.v2_product_option_values ov
                                  WHERE ov.option_group_id = og.id
                                ),
                                '[]'::jsonb
                              )
                            )
                            ORDER BY og.created_at
                          ),
                          '[]'::jsonb
                        )
                        FROM public.v2_product_option_groups og
                        WHERE og.product_id = p.id
                      )
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
                      'options', (
                        SELECT COALESCE(
                          jsonb_agg(
                            jsonb_build_object(
                              'group', jsonb_build_object(
                                'id', og.id,
                                'name', og.name,
                                'group_kind', og.group_kind,
                                'pricing_mode', og.pricing_mode,
                                'is_required', og.is_required,
                                'max_selectable', og.max_selectable
                              ),
                              'values', COALESCE(
                                (
                                  SELECT jsonb_agg(
                                    jsonb_build_object(
                                      'id', ov.id,
                                      'name', ov.name,
                                      'absolute_price', ov.absolute_price,
                                      'price_modifier', ov.price_modifier
                                    )
                                    ORDER BY ov.created_at
                                  )
                                  FROM public.v2_product_option_values ov
                                  WHERE ov.option_group_id = og.id
                                ),
                                '[]'::jsonb
                              )
                            )
                            ORDER BY og.created_at
                          ),
                          '[]'::jsonb
                        )
                        FROM public.v2_product_option_groups og
                        WHERE og.product_id = p.id
                      ),
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
                          ),
                          -- Compute from_price: min absolute_price from PRIMARY_PRICE group (if any)
                          fp AS (
                            SELECT MIN(ov.absolute_price) AS min_price
                            FROM public.v2_product_option_groups og
                            JOIN public.v2_product_option_values ov ON ov.option_group_id = og.id
                            WHERE og.product_id = p.id
                              AND og.group_kind = 'PRIMARY_PRICE'
                              AND og.pricing_mode = 'ABSOLUTE'
                              AND ov.absolute_price IS NOT NULL
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
                              END,
                            -- from_price: present when product has PRIMARY_PRICE formats
                            'from_price', (SELECT min_price FROM fp)
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
