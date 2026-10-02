-- import_products_into_catalog(uuid, uuid, text, jsonb, jsonb): chiede anche
-- products.write (PR di sicurezza 1/5, nota della /security-review).
--
-- La funzione è SECURITY DEFINER e salta la RLS: crea prodotti, gruppi
-- «Formati» e loro valori controllando solo catalogs.write. Dopo
-- 20261002160000 quelle tabelle chiedono products.write al client; senza questo
-- controllo un ruolo con catalogs.write e senza products.write li scriverebbe
-- passando di qui. Oggi i due permessi hanno gli stessi ruoli (owner, admin).
--
-- Corpo identico all'ultima definizione del repo
-- (20260630120000_rpc_import_products_into_catalog.sql), con una sola aggiunta
-- subito dopo il controllo su catalogs.write:
-- has_permission_any_activity('products.write', p_tenant_id), altrimenti 42501.
-- Il controllo vale per ogni import, anche quello che riusa solo prodotti
-- esistenti. Firma, SECURITY DEFINER e search_path invariati: CREATE OR REPLACE
-- conserva i grant (EXECUTE solo ad authenticated, anon tolto da
-- 20260701160000), quindi niente REVOKE/GRANT.
-- Prima di applicare: confrontare col live (pg_get_functiondef).

CREATE OR REPLACE FUNCTION public.import_products_into_catalog(
  p_tenant_id        uuid,
  p_catalog_id       uuid,
  p_new_catalog_name text,
  p_categories       jsonb,
  p_products         jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  -- r_* prefix avoids alias collision with table columns (plpgsql guardrail).
  r_catalog_id          uuid;
  r_ref_map             jsonb := '{}'::jsonb;   -- ref(text) -> category_id(text)
  r_cat                 jsonb;
  r_prod                jsonb;
  r_fmt                 jsonb;
  r_pass                int;
  r_level               int;
  r_parent_id           uuid;
  r_new_cat_id          uuid;
  r_target_cat_id       uuid;
  r_product_id          uuid;
  r_group_id            uuid;
  r_inserted_id         uuid;
  r_action              text;
  r_created_categories  int := 0;
  r_created_products    int := 0;
  r_reused_products     int := 0;
  r_skipped             int := 0;
  r_product_ids         uuid[] := '{}';
BEGIN
  -- VALIDATION 1a: caller must belong to p_tenant_id.
  -- Every write target (catalogs / catalog_categories / products /
  -- catalog_category_products) has an RLS WITH CHECK of
  --   tenant_id IN (SELECT get_my_tenant_ids())
  -- This function is SECURITY DEFINER and bypasses RLS, so we replicate that
  -- membership gate explicitly to prevent a cross-tenant write (e.g. the
  -- new-catalog branch inserting rows under a tenant the caller is not in).
  IF NOT (p_tenant_id IN (SELECT public.get_my_tenant_ids())) THEN
    RAISE EXCEPTION 'tenant % not accessible to caller', p_tenant_id USING errcode = '42501';
  END IF;

  -- VALIDATION 1b: caller must hold 'catalogs.write' ON THIS tenant.
  -- has_permission(text, uuid) has NO tenant parameter — its branches return
  -- true if the caller can write catalogs on ANY tenant they belong to, which
  -- would let an admin of tenant A write into tenant B where they are only a
  -- viewer. Use the tenant-bound helper instead so the permission is verified
  -- against p_tenant_id. A viewer belongs to the tenant (passes 1a) but its
  -- role lacks the catalogs.write seed → blocked here.
  IF NOT public.has_permission_any_activity('catalogs.write', p_tenant_id) THEN
    RAISE EXCEPTION 'permission denied: catalogs.write on tenant %', p_tenant_id
      USING errcode = '42501';
  END IF;

  -- VALIDATION 1c: caller must hold 'products.write' ON THIS tenant. The import
  -- creates products, option groups and option values, whose RLS now requires
  -- products.write (20261002160000); this function bypasses RLS.
  IF NOT public.has_permission_any_activity('products.write', p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden: missing products.write' USING ERRCODE = '42501';
  END IF;

  -- Resolve catalog (create new vs use existing)
  IF p_catalog_id IS NULL THEN
    IF p_new_catalog_name IS NULL OR length(btrim(p_new_catalog_name)) = 0 THEN
      RAISE EXCEPTION 'p_new_catalog_name is required when p_catalog_id is null';
    END IF;
    INSERT INTO public.catalogs (tenant_id, name)
    VALUES (p_tenant_id, p_new_catalog_name)
    RETURNING id INTO r_catalog_id;
  ELSE
    -- VALIDATION 2: catalog belongs to tenant
    SELECT c.id INTO r_catalog_id
    FROM public.catalogs c
    WHERE c.id = p_catalog_id AND c.tenant_id = p_tenant_id;
    IF r_catalog_id IS NULL THEN
      RAISE EXCEPTION 'catalog % does not belong to tenant %', p_catalog_id, p_tenant_id
        USING errcode = '42501';
    END IF;
  END IF;

  -- VALIDATION 3 + 5a: pre-validate categories; seed ref_map with existing ids.
  FOR r_cat IN SELECT * FROM jsonb_array_elements(COALESCE(p_categories, '[]'::jsonb))
  LOOP
    IF (r_cat->>'ref') IS NULL THEN
      RAISE EXCEPTION 'category entry missing "ref"';
    END IF;

    IF (r_cat->>'existing_id') IS NOT NULL THEN
      -- VALIDATION 3: existing category must belong to (tenant, resolved catalog)
      PERFORM 1
      FROM public.catalog_categories cc
      WHERE cc.id = (r_cat->>'existing_id')::uuid
        AND cc.tenant_id = p_tenant_id
        AND cc.catalog_id = r_catalog_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'category % not found in catalog % for tenant %',
          r_cat->>'existing_id', r_catalog_id, p_tenant_id USING errcode = '42501';
      END IF;
      r_ref_map := r_ref_map || jsonb_build_object(r_cat->>'ref', r_cat->>'existing_id');
    ELSE
      -- VALIDATION 5a: level must be 1|2|3 for to-be-created categories
      r_level := (r_cat->>'level')::int;
      IF r_level IS NULL OR r_level NOT IN (1, 2, 3) THEN
        RAISE EXCEPTION 'invalid level % for category ref %', r_cat->>'level', r_cat->>'ref';
      END IF;
    END IF;
  END LOOP;

  -- Create missing categories, parent before child (3 passes ordered by level).
  -- A child's parent_ref resolves to either an existing category (seeded above)
  -- or a category created in an earlier (lower-level) pass.
  FOR r_pass IN 1..3 LOOP
    FOR r_cat IN SELECT * FROM jsonb_array_elements(COALESCE(p_categories, '[]'::jsonb))
    LOOP
      IF (r_cat->>'existing_id') IS NULL AND (r_cat->>'level')::int = r_pass THEN
        r_parent_id := NULL;
        IF (r_cat->>'parent_ref') IS NOT NULL THEN
          -- VALIDATION 5b: parent_ref must resolve
          IF NOT (r_ref_map ? (r_cat->>'parent_ref')) THEN
            RAISE EXCEPTION 'parent_ref % unresolved for category ref %',
              r_cat->>'parent_ref', r_cat->>'ref';
          END IF;
          r_parent_id := (r_ref_map->>(r_cat->>'parent_ref'))::uuid;
        END IF;

        INSERT INTO public.catalog_categories
          (tenant_id, catalog_id, name, level, parent_category_id, sort_order, name_hash)
        VALUES
          (p_tenant_id,
           r_catalog_id,
           r_cat->>'name',
           (r_cat->>'level')::int,
           r_parent_id,
           COALESCE((r_cat->>'sort_order')::int, 0),
           r_cat->>'name_hash')
        RETURNING id INTO r_new_cat_id;

        r_ref_map := r_ref_map || jsonb_build_object(r_cat->>'ref', r_new_cat_id::text);
        r_created_categories := r_created_categories + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- Products
  FOR r_prod IN SELECT * FROM jsonb_array_elements(COALESCE(p_products, '[]'::jsonb))
  LOOP
    r_action := r_prod->>'action';

    -- Resolve destination category
    IF NOT (r_ref_map ? (r_prod->>'category_ref')) THEN
      RAISE EXCEPTION 'category_ref % unresolved for a product entry', r_prod->>'category_ref';
    END IF;
    r_target_cat_id := (r_ref_map->>(r_prod->>'category_ref'))::uuid;

    IF r_action = 'create' THEN
      INSERT INTO public.products
        (id, tenant_id, name, description, base_price, parent_product_id,
         image_url, product_type, variant_strategy, notes, description_hash, notes_hash)
      VALUES
        (gen_random_uuid(),
         p_tenant_id,
         r_prod->'product'->>'name',
         r_prod->'product'->>'description',
         NULLIF(r_prod->'product'->>'base_price', '')::numeric,
         NULL,
         r_prod->'product'->>'image_url',
         COALESCE(r_prod->'product'->>'product_type', 'simple'),
         COALESCE(r_prod->'product'->>'variant_strategy', 'manual'),
         COALESCE(r_prod->'product'->'notes', '[]'::jsonb),
         r_prod->'product'->>'description_hash',
         r_prod->'product'->>'notes_hash')
      RETURNING id INTO r_product_id;

      r_created_products := r_created_products + 1;
      r_product_ids := array_append(r_product_ids, r_product_id);

      -- formats => one PRIMARY_PRICE "Formati" group (ABSOLUTE) + N option values
      IF jsonb_typeof(r_prod->'product'->'formats') = 'array'
         AND jsonb_array_length(r_prod->'product'->'formats') > 0 THEN
        INSERT INTO public.product_option_groups
          (tenant_id, product_id, name, is_required, max_selectable, group_kind, pricing_mode, name_hash)
        VALUES
          (p_tenant_id, r_product_id, 'Formati', false, NULL, 'PRIMARY_PRICE', 'ABSOLUTE',
           r_prod->'product'->>'format_group_name_hash')
        RETURNING id INTO r_group_id;

        FOR r_fmt IN SELECT * FROM jsonb_array_elements(r_prod->'product'->'formats')
        LOOP
          INSERT INTO public.product_option_values
            (tenant_id, option_group_id, name, price_modifier, absolute_price, name_hash)
          VALUES
            (p_tenant_id,
             r_group_id,
             r_fmt->>'name',
             NULL,
             NULLIF(r_fmt->>'absolute_price', '')::numeric,
             r_fmt->>'name_hash');
        END LOOP;
      END IF;

    ELSIF r_action = 'reuse' THEN
      r_product_id := (r_prod->>'product_id')::uuid;
      -- VALIDATION 4: reused product must belong to tenant (server-side defense)
      PERFORM 1 FROM public.products p
      WHERE p.id = r_product_id AND p.tenant_id = p_tenant_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'product % does not belong to tenant %', r_product_id, p_tenant_id
          USING errcode = '42501';
      END IF;

    ELSE
      RAISE EXCEPTION 'invalid product action: %', r_action;
    END IF;

    -- Associate. ON CONFLICT on uq_ccp_parent (catalog, category, product) WHERE variant NULL.
    -- A product may legitimately live in multiple categories of the same catalog;
    -- the skip applies ONLY to the identical (catalog, category, product) triple.
    INSERT INTO public.catalog_category_products
      (tenant_id, catalog_id, category_id, product_id, variant_product_id, sort_order)
    VALUES
      (p_tenant_id, r_catalog_id, r_target_cat_id, r_product_id, NULL,
       COALESCE((r_prod->>'sort_order')::int, 0))
    ON CONFLICT (catalog_id, category_id, product_id) WHERE (variant_product_id IS NULL)
    DO NOTHING
    RETURNING id INTO r_inserted_id;

    IF r_inserted_id IS NULL THEN
      -- association already existed => skip (no error)
      r_skipped := r_skipped + 1;
    ELSIF r_action = 'reuse' THEN
      r_reused_products := r_reused_products + 1;
    END IF;

    r_inserted_id := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'catalog_id',         r_catalog_id,
    'created_categories', r_created_categories,
    'created_products',   r_created_products,
    'reused_products',    r_reused_products,
    'skipped',            r_skipped,
    'product_ids',        to_jsonb(r_product_ids),
    -- ref -> category_id for EVERY manifest category (created + existing), so the
    -- client can enqueue translations / revalidation for newly created categories too.
    'category_ref_map',   r_ref_map
  );
END;
$$;
