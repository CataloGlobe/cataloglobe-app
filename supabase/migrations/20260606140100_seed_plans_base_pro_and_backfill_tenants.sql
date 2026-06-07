BEGIN;

-- =============================================================================
-- Subscription refactor — Step 2/8: seed `base` + `pro`, backfill tenants
-- =============================================================================
--
-- Pricing & feature decisions (locked in by product, see docs/subscription-refactor-plan.md):
--   - base €39/seat/month — features_json = '{}' (Base is "everything not in Pro")
--   - pro  €59/seat/month — features_json = { table_reservation: true, table_ordering: true }
--
-- Stripe price IDs are intentionally left NULL here. Operator will:
--   1. Create the two Prices on Stripe Dashboard in *graduated* tier mode
--      (1st unit @ full price, 2nd+ units @ -10%).
--   2. Run a one-off UPDATE to populate `plans.stripe_price_id` for both rows.
--
-- Backfill: existing tenants (currently all carrying plan='pro' after
-- 20260411100000) keep `pro`. No tenant is downgraded to `base`.
-- =============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. UPSERT 'base'
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.plans (
    code,
    name,
    description,
    monthly_price_cents,
    stripe_price_id,
    features_json,
    sort_order,
    is_public,
    volume_discount_threshold,
    volume_discount_percent,
    max_self_service_seats,
    max_activities,
    max_products,
    max_catalogs
) VALUES (
    'base',
    'Base',
    'Menu digitale, QR, programmazione, gestione catalogo, analytics.',
    3900,
    NULL,
    '{}'::jsonb,
    10,
    true,
    2,
    10,
    5,
    NULL,
    NULL,
    NULL
)
ON CONFLICT (code) DO UPDATE SET
    name                       = EXCLUDED.name,
    description                = EXCLUDED.description,
    monthly_price_cents        = EXCLUDED.monthly_price_cents,
    features_json              = EXCLUDED.features_json,
    sort_order                 = EXCLUDED.sort_order,
    is_public                  = EXCLUDED.is_public,
    volume_discount_threshold  = EXCLUDED.volume_discount_threshold,
    volume_discount_percent    = EXCLUDED.volume_discount_percent,
    max_self_service_seats     = EXCLUDED.max_self_service_seats,
    updated_at                 = now();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. UPSERT 'pro' (already existing — enrich with new columns)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.plans (
    code,
    name,
    description,
    monthly_price_cents,
    stripe_price_id,
    features_json,
    sort_order,
    is_public,
    volume_discount_threshold,
    volume_discount_percent,
    max_self_service_seats,
    max_activities,
    max_products,
    max_catalogs
) VALUES (
    'pro',
    'Pro',
    'Tutto del piano Base + prenotazione tavolo + ordinazione al tavolo.',
    5900,
    NULL,
    '{"table_reservation": true, "table_ordering": true}'::jsonb,
    20,
    true,
    2,
    10,
    5,
    NULL,
    NULL,
    NULL
)
ON CONFLICT (code) DO UPDATE SET
    name                       = EXCLUDED.name,
    description                = EXCLUDED.description,
    monthly_price_cents        = EXCLUDED.monthly_price_cents,
    features_json              = EXCLUDED.features_json,
    sort_order                 = EXCLUDED.sort_order,
    is_public                  = EXCLUDED.is_public,
    volume_discount_threshold  = EXCLUDED.volume_discount_threshold,
    volume_discount_percent    = EXCLUDED.volume_discount_percent,
    max_self_service_seats     = EXCLUDED.max_self_service_seats,
    updated_at                 = now();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Backfill: existing tenants keep 'pro' (explicit, defense in depth).
--    No-op for currently active tenants (CHECK still IN ('pro') at this point —
--    Step 3 will relax it). Run is safe regardless of CHECK state.
-- ────────────────────────────────────────────────────────────────────────────

UPDATE public.tenants
   SET plan = 'pro'
 WHERE plan IS NULL OR plan NOT IN ('base', 'pro');

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Validation
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    plan_count int;
BEGIN
    SELECT COUNT(*) INTO plan_count
    FROM public.plans
    WHERE code IN ('base', 'pro');

    IF plan_count = 2 THEN
        RAISE NOTICE 'OK: both base and pro plans seeded.';
    ELSE
        RAISE EXCEPTION 'FAIL: only %/2 plans found.', plan_count;
    END IF;

    PERFORM 1 FROM public.plans
    WHERE code = 'base' AND monthly_price_cents = 3900 AND features_json = '{}'::jsonb;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL: base plan data mismatch.';
    END IF;
    RAISE NOTICE 'OK: base plan = 3900 cents, empty features.';

    PERFORM 1 FROM public.plans
    WHERE code = 'pro' AND monthly_price_cents = 5900
      AND features_json ? 'table_reservation'
      AND features_json ? 'table_ordering';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL: pro plan data mismatch.';
    END IF;
    RAISE NOTICE 'OK: pro plan = 5900 cents, table_reservation + table_ordering enabled.';

    PERFORM 1 FROM public.tenants WHERE plan IS NULL OR plan NOT IN ('base', 'pro');
    IF FOUND THEN
        RAISE EXCEPTION 'FAIL: tenant rows with invalid plan after backfill.';
    END IF;
    RAISE NOTICE 'OK: all tenants on base or pro.';
END $$;

COMMIT;
