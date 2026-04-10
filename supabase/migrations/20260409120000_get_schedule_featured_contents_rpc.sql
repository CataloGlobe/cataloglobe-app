-- =============================================================================
-- RPC: get_schedule_featured_contents(p_schedule_id)
-- =============================================================================
--
-- Sostituisce la policy "Public read schedule featured contents" (USING(true))
-- su schedule_featured_contents con una RPC SECURITY DEFINER accessibile ad anon.
--
-- MOTIVAZIONE:
--   La policy USING(true) permetteva a chiunque di leggere TUTTE le righe di
--   schedule_featured_contents senza alcun filtro su tenant. Questo è un buco
--   di sicurezza: un utente può enumerare le associazioni di tutti i tenant.
--
-- SOLUZIONE:
--   1. Creare una RPC SECURITY DEFINER che esegue il join internamente,
--      filtrata per schedule_id e con guard su tenant.deleted_at IS NULL.
--      La funzione bypassa RLS (SECURITY DEFINER) quindi non servono policy
--      anon aggiuntive su featured_content_products (che non ne aveva).
--   2. GRANT EXECUTE TO anon (accessibile dal client pubblico).
--   3. DROP della policy USING(true).
--
-- STRUTTURA JSONB RESTITUITA (array di oggetti):
--   [{ slot, sort_order, featured_content: { ...fc fields, products: [...] } }]
--
-- Il resolver TypeScript (resolveActivityCatalogs.ts) chiama supabase.rpc()
-- e processa il risultato con lo stesso codice già esistente (normalizeOne,
-- computeFromPrice, filtro status, sort, distribuzione slot).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Crea la RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_schedule_featured_contents(p_schedule_id uuid)
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
    AND fc.status       = 'published'
    AND t.deleted_at    IS NULL
$$;


-- ---------------------------------------------------------------------------
-- 2. Grant EXECUTE ad anon (e authenticated per completezza)
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.get_schedule_featured_contents(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_schedule_featured_contents(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. Drop la policy USING(true)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public read schedule featured contents"
  ON public.schedule_featured_contents;


-- ---------------------------------------------------------------------------
-- 4. Validazione
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  fn_row record;
BEGIN
  -- 4a. Funzione esiste ed è SECURITY DEFINER
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

  RAISE NOTICE 'OK: get_schedule_featured_contents() — SECURITY DEFINER, STABLE confermato.';

  -- 4b. Policy USING(true) rimossa
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'schedule_featured_contents'
      AND policyname = 'Public read schedule featured contents'
  ) THEN
    RAISE EXCEPTION 'FAIL: la policy "Public read schedule featured contents" esiste ancora.';
  END IF;

  RAISE NOTICE 'OK: policy "Public read schedule featured contents" rimossa.';

  -- 4c. Le policy authenticated rimangono intatte
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'schedule_featured_contents'
      AND policyname = 'Tenant select own rows'
      AND cmd        = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'FAIL: policy authenticated "Tenant select own rows" rimossa per errore.';
  END IF;

  RAISE NOTICE 'OK: policy authenticated "Tenant select own rows" intatta.';
END $$;


COMMIT;
