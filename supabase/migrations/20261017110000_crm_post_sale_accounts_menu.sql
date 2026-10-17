-- =============================================================================
-- CRM post-vendita: «menù online» conta anche le regole `menu` (multi menù)
-- =============================================================================
-- Stessa funzione di 20261006090100 (di Alex), cambia solo la regola «quale
-- menù»: con il multi menù una `layout` diventa una `menu` (catalogo in
-- `schedule_menu`, sempre presente) più una `style`. Senza questo, dopo la
-- conversione `has_live_menu` tornerebbe falso per tutti.
-- CREATE OR REPLACE con la stessa firma tiene i grant di 20261006090200.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.crm_post_sale_accounts()
RETURNS TABLE (
    venue_id              uuid,
    tenant_id             uuid,
    tenant_created_at     timestamptz,
    plan                  text,
    paid_seats            integer,
    activities_total      integer,
    activities_published  integer,
    products_count        integer,
    has_live_menu         boolean,
    live_menu_since       timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
        RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        v.id,
        t.id,
        t.created_at,
        t.plan::text,
        t.paid_seats::integer,
        (SELECT count(*)::integer FROM public.activities a WHERE a.tenant_id = t.id),
        (SELECT count(*)::integer FROM public.activities a WHERE a.tenant_id = t.id AND a.status = 'active'),
        (SELECT count(*)::integer FROM public.products p
            WHERE p.tenant_id = t.id AND p.parent_product_id IS NULL),
        lm.since IS NOT NULL
            AND EXISTS (SELECT 1 FROM public.activities a WHERE a.tenant_id = t.id AND a.status = 'active'),
        lm.since
    FROM public.crm_venues v
    JOIN public.tenants t ON t.id = v.tenant_id AND t.deleted_at IS NULL
    LEFT JOIN LATERAL (
        SELECT min(s.created_at) AS since
        FROM public.schedules s
        WHERE s.tenant_id = t.id
          AND s.rule_type IN ('layout', 'menu')
          AND s.enabled
          AND (s.start_at IS NULL OR s.start_at <= now())
          AND (s.end_at IS NULL OR s.end_at > now())
          AND (
              EXISTS (
                  SELECT 1 FROM public.schedule_layout sl
                  WHERE sl.schedule_id = s.id AND sl.catalog_id IS NOT NULL
              )
              OR EXISTS (SELECT 1 FROM public.schedule_menu sm WHERE sm.schedule_id = s.id)
          )
    ) lm ON true
    ORDER BY v.id;
END;
$$;
