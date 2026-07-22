-- =============================================================================
-- tenants — colonne ciclo di fatturazione per metering AI (FASE 3b)
-- =============================================================================
--
-- Due colonne nullable, sincronizzate da stripe-webhook (stessi 3 handler che
-- già scrivono current_period_end):
--
--   1. current_period_start — inizio del periodo Stripe corrente. Con
--      current_period_end (20260606190000) forma la finestra su cui
--      get_ai_usage_current_cycle aggrega ai_usage_events. Prima veniva
--      SCARTATA dal payload webhook.
--   2. plan_monthly_value_cents — valore mensile CONTRATTUALE del piano
--      (price × quantity dai tiers Stripe, AL LORDO di coupon/sconti). Un
--      comped 100%-off risulta al valore pieno, non a 0: la quota AI (FASE 4)
--      si calcola sul piano sottoscritto, non sull'incasso effettivo. In
--      questa fase la colonna viene popolata ma non ancora consumata.
--
-- NULL su entrambe = tenant senza subscription Stripe (trialing puro, test):
-- get_ai_usage_current_cycle cade sulla finestra di ripiego mensile ancorata
-- a created_at. subscription.deleted azzera current_period_start (mirror di
-- current_period_end); plan_monthly_value_cents resta (storico innocuo,
-- tenant non eleggibile comunque).
--
-- Backfill one-off per subscription esistenti: script fuori repo (FASE 3b
-- Parte 3), rilegge start + valore da Stripe API.
-- =============================================================================

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS current_period_start     timestamptz,
    ADD COLUMN IF NOT EXISTS plan_monthly_value_cents integer;

COMMENT ON COLUMN public.tenants.current_period_start IS
    'Inizio periodo di fatturazione Stripe corrente (item-level, fallback '
    'subscription-level). Synced via stripe-webhook. NULL = nessuna subscription.';

COMMENT ON COLUMN public.tenants.plan_monthly_value_cents IS
    'Valore mensile contrattuale del piano in centesimi, AL LORDO di coupon/'
    'sconti (tiers Stripe × seats). Base quota AI — mai amount_due post-coupon. '
    'Synced via stripe-webhook.';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.tenants'::regclass
          AND conname  = 'tenants_plan_monthly_value_cents_check'
    ) THEN
        ALTER TABLE public.tenants
            ADD CONSTRAINT tenants_plan_monthly_value_cents_check
                CHECK (plan_monthly_value_cents IS NULL OR plan_monthly_value_cents >= 0);
    END IF;
END $$;
