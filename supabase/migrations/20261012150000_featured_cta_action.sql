-- «Prenota» come azione del pulsante di un contenuto in evidenza (D72, risposta a).
--
-- cta_action = 'link'        → il pulsante apre cta_url (com'è oggi, default)
-- cta_action = 'reservation' → il pulsante apre il form di prenotazione della sede
--                              (/:slug/prenota); cta_url viene ignorato.
--
-- Additiva: una colonna con default 'link' (le righe esistenti restano com'erano)
-- e la stessa funzione con una chiave in più in featured_content. Il corpo è quello
-- live di get_schedule_featured_contents(uuid, uuid) (pg_get_functiondef su staging,
-- 2026-10-12), con solo 'cta_action' aggiunto. Firma, SECURITY DEFINER, search_path,
-- filtri di tenant e grant restano uguali (CREATE OR REPLACE non tocca i grant).

BEGIN;

ALTER TABLE public.featured_contents
  ADD COLUMN IF NOT EXISTS cta_action text NOT NULL DEFAULT 'link';

ALTER TABLE public.featured_contents
  DROP CONSTRAINT IF EXISTS featured_contents_cta_action_check;

ALTER TABLE public.featured_contents
  ADD CONSTRAINT featured_contents_cta_action_check
  CHECK (cta_action IN ('link', 'reservation'));

CREATE OR REPLACE FUNCTION public.get_schedule_featured_contents(p_schedule_id uuid, p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'slot',       sfc.slot,
        'sort_order', sfc.sort_order,
        'featured_content', jsonb_build_object(
          'id',                  fc.id,
          'internal_name',       fc.internal_name,
          'title',               fc.title,
          'subtitle',            fc.subtitle,
          'description',         fc.description,
          'media_id',            fc.media_id,
          'media_focal_x',       fc.media_focal_x,
          'media_focal_y',       fc.media_focal_y,
          'media_zoom',          fc.media_zoom,
          'media_fill_mode',     fc.media_fill_mode,
          'media_fill_color',    fc.media_fill_color,
          'media_aspect_ratio',  fc.media_aspect_ratio,
          'cta_text',            fc.cta_text,
          'cta_url',             fc.cta_url,
          'cta_action',          fc.cta_action,
          'status',              fc.status,
          'layout_style',        fc.layout_style,
          'pricing_mode',        fc.pricing_mode,
          'content_type',        fc.content_type,
          'bundle_price',        fc.bundle_price,
          'show_original_total', fc.show_original_total,
          'created_at',          fc.created_at,
          'updated_at',          fc.updated_at,
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
  JOIN public.featured_contents fc ON fc.id  = sfc.featured_content_id
  JOIN public.schedules          s  ON s.id   = sfc.schedule_id
  JOIN public.tenants            t  ON t.id   = s.tenant_id
  WHERE sfc.schedule_id = p_schedule_id
    AND s.tenant_id     = p_tenant_id
    AND fc.tenant_id    = p_tenant_id
    AND fc.status       = 'published'
    AND t.deleted_at    IS NULL
$function$;

COMMIT;
