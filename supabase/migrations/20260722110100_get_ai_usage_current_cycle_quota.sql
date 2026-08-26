-- =============================================================================
-- get_ai_usage_current_cycle — estensione FASE 4: quota + status enforcement
-- =============================================================================
--
-- FASE 3b calcolava solo FATTI sul consumo. FASE 4 la rende la FONTE UNICA di
-- enforcement + UI: aggiunge al ritorno quota, percentuale, status, reset_at.
-- Chi decide il blocco (trigger translation_jobs + le 2 edge Gemini) legge
-- SOLO questa RPC → FE, edge e trigger non possono divergere.
--
-- Colonne aggiunte al ritorno:
--   quota_nanos_usd  bigint       = plans.ai_quota_nanos_usd_per_seat × paid_seats
--                                   (NULL se quota non configurata → fail-CLOSED)
--   percent          numeric(6,2) = total_cost / quota × 100 (NULL se quota NULL/0)
--   status           text         = ok | warning | blocked | not_eligible
--   reset_at         timestamptz  = window_end (quando la quota si azzera)
--
-- Soglie status (consumo vs quota, in nano-USD):
--   not_eligible : subscription_status senza diritto al servizio
--   ok           : percent < 80
--   warning      : 80 ≤ percent < 100
--   blocked      : percent ≥ 100  (hard block, nessuno sforamento)
--                  OPPURE quota NULL/non configurata → fail-CLOSED (errore di
--                  config nostro: mai consumo illimitato silenzioso). Diverso da
--                  not_eligible, che è "tenant senza diritto al servizio".
--
-- ⚠️ Il ritorno cambia forma (nuove OUT columns) → CREATE OR REPLACE non basta
-- (Postgres rifiuta il cambio di tipo di ritorno): serve DROP + CREATE. Il DROP
-- azzera l'ACL → i GRANT vanno RI-eseguiti nel file successivo (110200).
-- La logica finestra/eleggibilità/aggregazione è invariata rispetto a 100100.
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_ai_usage_current_cycle(uuid);

CREATE FUNCTION public.get_ai_usage_current_cycle(p_tenant_id uuid)
RETURNS TABLE (
    eligible             boolean,
    window_start         timestamptz,
    window_end           timestamptz,
    window_source        text,
    total_cost_nanos_usd bigint,
    events_count         bigint,
    breakdown            jsonb,
    quota_nanos_usd      bigint,
    percent              numeric,
    status               text,
    reset_at             timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_status   text;
    v_ps       timestamptz;
    v_pe       timestamptz;
    v_created  timestamptz;
    v_plan     text;
    v_seats    integer;
    v_per_seat bigint;
    v_quota    bigint;
    v_ws       timestamptz;
    v_we       timestamptz;
    v_src      text;
    v_months   integer;
BEGIN
    -- Access check: membro del tenant, oppure service_role (edge/trigger).
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND p_tenant_id NOT IN (SELECT public.get_my_tenant_ids()) THEN
        RAISE EXCEPTION 'not a member of this tenant' USING ERRCODE = '42501';
    END IF;

    SELECT t.subscription_status, t.current_period_start, t.current_period_end,
           t.created_at, t.plan, t.paid_seats
      INTO v_status, v_ps, v_pe, v_created, v_plan, v_seats
      FROM public.tenants t
     WHERE t.id = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'tenant % not found', p_tenant_id USING ERRCODE = 'P0002';
    END IF;

    -- Non eleggibile: flag, non errore. Nessun calcolo, status='not_eligible'.
    IF v_status NOT IN ('trialing', 'active', 'past_due') THEN
        RETURN QUERY SELECT
            false,
            NULL::timestamptz, NULL::timestamptz, NULL::text,
            NULL::bigint, NULL::bigint, NULL::jsonb,
            NULL::bigint, NULL::numeric, 'not_eligible'::text, NULL::timestamptz;
        RETURN;
    END IF;

    -- Quota del ciclo (nano-USD). per_seat NULL → quota NULL → fail-CLOSED
    -- (status='blocked' sotto: config mancante = blocco, non illimitato).
    SELECT p.ai_quota_nanos_usd_per_seat INTO v_per_seat
      FROM public.plans p
     WHERE p.code = v_plan;

    IF v_per_seat IS NULL OR v_seats IS NULL THEN
        v_quota := NULL;
    ELSE
        v_quota := v_per_seat * v_seats;
    END IF;

    -- Finestra (identica a 100100).
    IF v_pe IS NOT NULL THEN
        v_we := v_pe;
        IF v_ps IS NOT NULL THEN
            v_ws  := v_ps;
            v_src := 'stripe';
        ELSE
            v_ws  := v_pe - interval '1 month';
            v_src := 'stripe_derived_start';
        END IF;
    ELSE
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
    WITH agg AS (
        SELECT COALESCE(SUM(e.cost_nanos_usd), 0)::bigint AS total,
               COUNT(*)::bigint                           AS cnt
          FROM public.ai_usage_events e
         WHERE e.tenant_id = p_tenant_id
           AND e.created_at >= v_ws
           AND e.created_at <  v_we
    )
    SELECT
        true,
        v_ws,
        v_we,
        v_src,
        agg.total,
        agg.cnt,
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
        ), '[]'::jsonb),
        v_quota,
        CASE
            WHEN v_quota IS NULL OR v_quota = 0 THEN NULL
            ELSE round(agg.total * 100.0 / v_quota, 2)
        END,
        CASE
            -- Quota NON configurata (per_seat NULL) = errore di config NOSTRO:
            -- fail-CLOSED. Distinto da not_eligible (tenant senza diritto). NON
            -- deve tradursi in consumo illimitato silenzioso.
            WHEN v_quota IS NULL              THEN 'blocked'
            WHEN agg.total >= v_quota         THEN 'blocked'
            WHEN agg.total * 100.0 / v_quota >= 80 THEN 'warning'
            ELSE 'ok'
        END,
        v_we
    FROM agg;
END;
$$;

COMMENT ON FUNCTION public.get_ai_usage_current_cycle(uuid) IS
    'Consumo AI + QUOTA del ciclo di fatturazione corrente. Fonte UNICA di '
    'enforcement (trigger translation_jobs + edge Gemini) e UI (barra consumi). '
    'quota_nanos_usd = plans.ai_quota_nanos_usd_per_seat × paid_seats (NULL = '
    'fail-open). status: ok|warning|blocked|not_eligible. reset_at = window_end.';
