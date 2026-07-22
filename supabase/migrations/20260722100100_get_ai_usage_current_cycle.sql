-- =============================================================================
-- get_ai_usage_current_cycle — consumo AI del ciclo di fatturazione corrente
-- =============================================================================
--
-- FASE 3b: la RPC calcola e ritorna NUMERI, non decide nulla. Zero enforcement,
-- zero quota: quello è FASE 4, altrove.
--
-- Finestra calcolata QUI dentro (unico posto — FE ed edge non possono
-- divergere, stesso razionale di get_operative_day_start):
--   - subscription Stripe presente (current_period_end NOT NULL):
--       [current_period_start, current_period_end); se start mancante
--       (backfill non ancora girato), derivato come end - 1 mese
--       (window_source = 'stripe_derived_start').
--   - nessuna subscription (current_period_end NULL): ripiego mensile
--       ancorato al giorno-del-mese di created_at, finestra che contiene
--       now(). L'aritmetica a mesi di Postgres clampa da sé le ancore di
--       fine mese (31 gen + 1 mese = 28/29 feb).
--
-- Eleggibilità: subscription_status IN ('trialing','active','past_due') —
-- gli stati che danno diritto al servizio. 'canceled'/'suspended' →
-- eligible=false, finestra e consumo NULL (flag, non errore). Coerente con
-- subscription.deleted che azzera il periodo.
--
-- Aggregazione su ai_usage_events via idx_ai_usage_events_tenant_created
-- (tenant_id, created_at DESC). SUM ignora i cost_nanos_usd NULL (provider
-- fuori tariffario, es. mock): le unità restano nel breakdown via events.
--
-- Access: membro del tenant (get_my_tenant_ids) o service_role (edge).
-- GRANT/REVOKE nel file successivo (gotcha 42601 su db push).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_ai_usage_current_cycle(p_tenant_id uuid)
RETURNS TABLE (
    eligible             boolean,
    window_start         timestamptz,
    window_end           timestamptz,
    window_source        text,
    total_cost_nanos_usd bigint,
    events_count         bigint,
    breakdown            jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_status  text;
    v_ps      timestamptz;
    v_pe      timestamptz;
    v_created timestamptz;
    v_ws      timestamptz;
    v_we      timestamptz;
    v_src     text;
    v_months  integer;
BEGIN
    -- Access check: membro del tenant, oppure service_role (edge functions).
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND p_tenant_id NOT IN (SELECT public.get_my_tenant_ids()) THEN
        RAISE EXCEPTION 'not a member of this tenant' USING ERRCODE = '42501';
    END IF;

    SELECT t.subscription_status, t.current_period_start, t.current_period_end, t.created_at
      INTO v_status, v_ps, v_pe, v_created
      FROM public.tenants t
     WHERE t.id = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'tenant % not found', p_tenant_id USING ERRCODE = 'P0002';
    END IF;

    -- Non eleggibile: flag, non errore. Nessun calcolo.
    IF v_status NOT IN ('trialing', 'active', 'past_due') THEN
        RETURN QUERY SELECT
            false,
            NULL::timestamptz, NULL::timestamptz, NULL::text,
            NULL::bigint, NULL::bigint, NULL::jsonb;
        RETURN;
    END IF;

    -- Finestra.
    IF v_pe IS NOT NULL THEN
        v_we := v_pe;
        IF v_ps IS NOT NULL THEN
            v_ws  := v_ps;
            v_src := 'stripe';
        ELSE
            -- start non ancora backfillato: derivazione conservativa.
            v_ws  := v_pe - interval '1 month';
            v_src := 'stripe_derived_start';
        END IF;
    ELSE
        -- Ripiego mensile ancorato a created_at: la finestra mensile che
        -- contiene now(). make_interval(months=>n) clampa le ancore di fine
        -- mese automaticamente.
        v_months := (extract(year  from now())::integer - extract(year  from v_created)::integer) * 12
                  + (extract(month from now())::integer - extract(month from v_created)::integer);
        v_ws := v_created + make_interval(months => v_months);
        IF v_ws > now() THEN
            v_months := v_months - 1;
            v_ws := v_created + make_interval(months => v_months);
        END IF;
        v_we  := v_created + make_interval(months => v_months + 1);
        v_src := 'fallback_monthly';
    END IF;

    RETURN QUERY
    SELECT
        true,
        v_ws,
        v_we,
        v_src,
        COALESCE(SUM(e.cost_nanos_usd), 0)::bigint,
        COUNT(*)::bigint,
        COALESCE((
            SELECT jsonb_agg(
                       jsonb_build_object(
                           'provider',        b.provider,
                           'operation',       b.operation,
                           'cost_nanos_usd',  b.cost,
                           'events',          b.cnt
                       )
                       ORDER BY b.cost DESC NULLS LAST
                   )
              FROM (
                  SELECT e2.provider,
                         e2.operation,
                         COALESCE(SUM(e2.cost_nanos_usd), 0)::bigint AS cost,
                         COUNT(*)::bigint                            AS cnt
                    FROM public.ai_usage_events e2
                   WHERE e2.tenant_id = p_tenant_id
                     AND e2.created_at >= v_ws
                     AND e2.created_at <  v_we
                   GROUP BY e2.provider, e2.operation
              ) b
        ), '[]'::jsonb)
    FROM public.ai_usage_events e
    WHERE e.tenant_id = p_tenant_id
      AND e.created_at >= v_ws
      AND e.created_at <  v_we;
END;
$$;

COMMENT ON FUNCTION public.get_ai_usage_current_cycle(uuid) IS
    'Consumo AI del tenant nel ciclo di fatturazione corrente (finestra Stripe '
    'o ripiego mensile su created_at). Solo fatti, nessun giudizio quota. '
    'eligible=false per stati senza diritto al servizio.';
