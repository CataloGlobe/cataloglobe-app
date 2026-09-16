-- =============================================================================
-- get_ai_usage_current_cycle — finestra MENSILE indipendente dall'intervallo
-- di fatturazione (prerequisito abbonamento annuale)
-- =============================================================================
--
-- Prima (20260722110100): finestra = intero periodo Stripe
-- [current_period_start, current_period_end). Corretto finché ogni
-- abbonamento è mensile; con un periodo annuale la finestra diventerebbe di
-- 12 mesi e la quota per sede (tarata sul mese) resterebbe la stessa →
-- un cliente annuale avrebbe 1/12 dell'AI di un mensile, consumabile in un
-- colpo e poi bloccata fino al rinnovo.
--
-- Regola: la quota è MENSILE qualunque sia l'intervallo di fatturazione, si
-- resetta ogni mese, nessun rollover.
--
-- Finestra = sotto-periodo mensile che contiene now(), ottenuto sommando mesi
-- INTERI a un'ancora:
--   - current_period_start NOT NULL → ancora = current_period_start,
--     window_source = 'stripe_monthly'. Per un abbonamento mensile coincide
--     con la finestra precedente [start, end) (end = start + 1 mese, stessa
--     aritmetica di clamp fine-mese di Stripe e Postgres: 31 gen → 28 feb,
--     31 gen + 2 mesi → 31 mar). Al rinnovo Stripe scrive il nuovo start =
--     vecchio end → i sotto-periodi restano allineati senza discontinuità.
--   - current_period_start NULL → ancora = tenants.created_at,
--     window_source = 'fallback_monthly' (ramo INVARIATO). Copre sia i tenant
--     senza subscription sia il caso start non backfillato: il vecchio
--     'stripe_derived_start' (end − 1 mese) assumeva un periodo mensile ed è
--     scorretto su un periodo annuale → ritirato.
--
-- La RPC NON legge più current_period_end e NON conosce l'intervallo di
-- fatturazione: si ancora solo alle date. reset_at = fine del sotto-periodo
-- mensile corrente (non più fine del periodo di fatturazione).
--
-- window_source: valori ora possibili = 'stripe_monthly' | 'fallback_monthly'.
-- 'stripe' e 'stripe_derived_start' non vengono più emessi. Nessun consumatore
-- FE/edge legge il campo (solo tipizzato in RawRow, mai mappato).
--
-- Invarianti conservate: firma, colonne di ritorno, access check
-- (get_my_tenant_ids / service_role), SECURITY DEFINER, search_path '',
-- eleggibilità, quota = plans.ai_quota_nanos_usd_per_seat × paid_seats con
-- fail-CLOSED su quota NULL, soglie status, aggregazione su ai_usage_events.
--
-- Il tipo di ritorno è invariato → CREATE OR REPLACE (nessun DROP): l'ACL
-- della funzione (REVOKE PUBLIC/anon, GRANT authenticated/service_role di
-- 20260722110200) resta intatta e non serve un file grants separato.
-- Il trigger enforce_ai_quota_on_translation_job non cambia: continua a
-- leggere solo `status` da questa funzione (invariante GUC intatta: il calcolo
-- della finestra resta interamente qui dentro).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_ai_usage_current_cycle(p_tenant_id uuid)
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
    v_created  timestamptz;
    v_plan     text;
    v_seats    integer;
    v_per_seat bigint;
    v_quota    bigint;
    v_anchor   timestamptz;
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

    SELECT t.subscription_status, t.current_period_start,
           t.created_at, t.plan, t.paid_seats
      INTO v_status, v_ps, v_created, v_plan, v_seats
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

    -- Quota MENSILE (nano-USD). per_seat NULL → quota NULL → fail-CLOSED
    -- (status='blocked' sotto: config mancante = blocco, non illimitato).
    SELECT p.ai_quota_nanos_usd_per_seat INTO v_per_seat
      FROM public.plans p
     WHERE p.code = v_plan;

    IF v_per_seat IS NULL OR v_seats IS NULL THEN
        v_quota := NULL;
    ELSE
        v_quota := v_per_seat * v_seats;
    END IF;

    -- Ancora della finestra mensile: inizio periodo Stripe se presente,
    -- altrimenti created_at (ripiego invariato).
    IF v_ps IS NOT NULL THEN
        v_anchor := v_ps;
        v_src    := 'stripe_monthly';
    ELSE
        v_anchor := v_created;
        v_src    := 'fallback_monthly';
    END IF;

    -- Sotto-periodo mensile che contiene now(): ancora + n mesi interi.
    -- make_interval(months=>n) clampa le ancore di fine mese automaticamente.
    -- Funziona anche con ancora nel futuro (n negativo).
    v_months := (extract(year  from now())::integer - extract(year  from v_anchor)::integer) * 12
              + (extract(month from now())::integer - extract(month from v_anchor)::integer);
    v_ws := v_anchor + make_interval(months => v_months);
    IF v_ws > now() THEN
        v_months := v_months - 1;
        v_ws := v_anchor + make_interval(months => v_months);
    END IF;
    v_we := v_anchor + make_interval(months => v_months + 1);

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
    'Consumo AI + QUOTA del MESE corrente, indipendente dall''intervallo di '
    'fatturazione: sotto-periodo mensile ancorato a current_period_start '
    '(window_source=stripe_monthly) o a created_at (fallback_monthly). Fonte '
    'UNICA di enforcement (trigger translation_jobs + edge Gemini) e UI. '
    'quota_nanos_usd = plans.ai_quota_nanos_usd_per_seat × paid_seats (NULL = '
    'fail-closed). status: ok|warning|blocked|not_eligible. reset_at = fine del '
    'sotto-periodo mensile.';
