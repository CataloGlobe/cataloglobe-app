-- =============================================================================
-- CRM interno (Fase 1, F1-9, prima parte): riepilogo del giro in /admin
-- =============================================================================
-- crm_summary(da, a): i numeri del giro in un periodo, dai dati che il CRM
-- raccoglie già (lead, eventi di fase, primo contatto). Nessuna tabella nuova.
--
--   leads_in          richieste entrate (crm_leads.received_at), per fonte
--   new_venues        locali nuovi (evento lead_in)
--   returned          lead tornati (evento lead_returned)
--   contacted         locali contattati per la prima volta (first_contacted_at)
--   stages            locali arrivati in ciascuna fase nel periodo (eventi
--                     stage_changed verso quella fase, un locale una volta)
--   lost              locali passati in Perso, per tipo (obiezione / stop)
--   first_contact_minutes_median
--                     minuti tra la richiesta e il primo contatto, mediana,
--                     sui locali contattati nel periodo
--   pipeline          fasi di adesso (non dipende dal periodo)
--
-- SECURITY INVOKER: le RLS delle crm_* lasciano leggere solo gli admin di
-- piattaforma; chi non lo è riceve un errore, non dei numeri a zero.
-- GRANT in 20261004020100.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.crm_summary(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v jsonb;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = '42501';
    END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to - p_from > interval '400 days' THEN
        RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023';
    END IF;

    SELECT jsonb_build_object(
        'leads_in', (SELECT count(*) FROM public.crm_leads l WHERE l.received_at >= p_from AND l.received_at < p_to),
        'leads_by_source', coalesce((
            SELECT jsonb_object_agg(x.source, x.n) FROM (
                SELECT l.source, count(*) AS n FROM public.crm_leads l
                WHERE l.received_at >= p_from AND l.received_at < p_to GROUP BY l.source
            ) x
        ), '{}'::jsonb),
        'new_venues', (SELECT count(*) FROM public.crm_events e
                       WHERE e.type = 'lead_in' AND e.created_at >= p_from AND e.created_at < p_to),
        'returned', (SELECT count(*) FROM public.crm_events e
                     WHERE e.type = 'lead_returned' AND e.created_at >= p_from AND e.created_at < p_to),
        'contacted', (SELECT count(*) FROM public.crm_venues v
                      WHERE v.first_contacted_at >= p_from AND v.first_contacted_at < p_to),
        'stages', coalesce((
            SELECT jsonb_object_agg(x.stage, x.n) FROM (
                SELECT e.payload->>'to' AS stage, count(DISTINCT e.venue_id) AS n
                FROM public.crm_events e
                WHERE e.type = 'stage_changed' AND e.created_at >= p_from AND e.created_at < p_to
                  AND e.payload->>'to' IS NOT NULL
                GROUP BY e.payload->>'to'
            ) x
        ), '{}'::jsonb),
        'lost', coalesce((
            SELECT jsonb_object_agg(x.kind, x.n) FROM (
                SELECT coalesce(e.payload->>'lost_kind', 'obiezione') AS kind, count(DISTINCT e.venue_id) AS n
                FROM public.crm_events e
                WHERE e.type = 'stage_changed' AND e.payload->>'to' = 'perso'
                  AND e.created_at >= p_from AND e.created_at < p_to
                GROUP BY 1
            ) x
        ), '{}'::jsonb),
        'first_contact_minutes_median', (
            SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM v.first_contacted_at - f.first_at) / 60))::numeric, 1)
            FROM public.crm_venues v
            JOIN LATERAL (
                SELECT min(l.received_at) AS first_at FROM public.crm_leads l WHERE l.venue_id = v.id
            ) f ON f.first_at IS NOT NULL
            WHERE v.first_contacted_at >= p_from AND v.first_contacted_at < p_to
              AND v.first_contacted_at >= f.first_at
        ),
        'pipeline', coalesce((
            SELECT jsonb_object_agg(x.stage, x.n) FROM (
                SELECT v.stage, count(*) AS n FROM public.crm_venues v GROUP BY v.stage
            ) x
        ), '{}'::jsonb)
    ) INTO v;
    RETURN v;
END;
$$;
