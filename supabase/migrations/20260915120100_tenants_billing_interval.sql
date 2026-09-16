BEGIN;

-- =============================================================================
-- tenants.billing_interval — intervallo di fatturazione corrente (cache Stripe)
-- + deprecazione di plans.stripe_price_id / plans.monthly_price_cents
-- =============================================================================
--
-- Stesso pattern di paid_seats / current_period_*: Stripe e' la fonte, il
-- webhook scrive la cache su tenants a ogni checkout.session.completed e
-- customer.subscription.updated. Fonte nel webhook, in ordine:
--   1. plan_prices (Price dell'item → piano + intervallo, autoritativa);
--   2. items[0].price.recurring.interval (Stripe lo espone sempre sull'item).
-- NON i metadata della subscription: uno schedule release non li riscrive,
-- quindi non sono affidabili per l'intervallo corrente.
--
-- NULL = sconosciuto (tenant senza subscription). Backfill 'month' per chi ha
-- gia' una subscription: oggi esistono SOLO Price mensili, il dato e' certo, e
-- senza backfill l'invariante "nulla cambia per un abbonato mensile" non
-- sarebbe vera prima del prossimo evento webhook.
--
-- Il ramo customer.subscription.deleted NON azzera la colonna (come
-- plan_monthly_value_cents: valore storico innocuo, tenant non eleggibile).
-- =============================================================================

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS billing_interval text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.tenants'::regclass
          AND conname  = 'tenants_billing_interval_check'
    ) THEN
        ALTER TABLE public.tenants
            ADD CONSTRAINT tenants_billing_interval_check
                CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year'));
    END IF;
END $$;

COMMENT ON COLUMN public.tenants.billing_interval IS
    'Intervallo di fatturazione corrente della subscription Stripe (month | year), '
    'cache scritta dal webhook da plan_prices (Price dell''item) con fallback su '
    'recurring.interval. NULL = nessuna subscription nota. Non azzerato su '
    'customer.subscription.deleted.';

-- Backfill: solo Price mensili in esercizio → ogni subscription esistente e' 'month'.
UPDATE public.tenants
   SET billing_interval = 'month'
 WHERE stripe_subscription_id IS NOT NULL
   AND billing_interval IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- Deprecazione colonne su plans (rimosse in un passo successivo, dopo la
-- migrazione dei lettori FE a plan_prices). Nessun codice deve piu' scriverle.
-- ────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.plans.stripe_price_id IS
    'DEPRECATED (20260915120000): usare plan_prices(plan_code, billing_interval). '
    'Non piu'' letta da checkout/webhook/change-subscription ne'' dal frontend. '
    'Da rimuovere in un passo successivo.';

COMMENT ON COLUMN public.plans.monthly_price_cents IS
    'DEPRECATED (20260915120000): il prezzo per intervallo vive in '
    'plan_prices.price_cents (riga month). Ancora letta dal frontend per la '
    'visualizzazione fino alla migrazione dei lettori; da rimuovere dopo.';

DO $$
DECLARE
    unfilled int;
BEGIN
    SELECT COUNT(*) INTO unfilled
      FROM public.tenants
     WHERE stripe_subscription_id IS NOT NULL AND billing_interval IS NULL;
    IF unfilled > 0 THEN
        RAISE EXCEPTION 'FAIL: % tenant(s) with subscription but NULL billing_interval.', unfilled;
    END IF;
    RAISE NOTICE 'OK: tenants.billing_interval present, backfill complete.';
END $$;

COMMIT;
