BEGIN;

-- =============================================================================
-- customer_invoices.billing_interval — intervallo di fatturazione dell'incasso
-- =============================================================================
--
-- Passo 4a dell'abbonamento annuale. Con l'annuale acquistabile, una riga da
-- ~€1.100 nell'archivio incassi non e' distinguibile da diciannove mensili:
-- chi emette le fatture deve sapere se l'importo copre un mese o un anno.
--
-- Stesso dominio di `tenants.billing_interval` / `plan_prices.billing_interval`
-- (valori Stripe `recurring.interval`). Nullable: le righe storiche e le
-- fatture one-off (delta sedi, nessuna riga di periodo) restano NULL. Il
-- webhook la scrive leggendo il Price della riga di periodo della fattura
-- (plan_prices), con fallback a tenants.billing_interval.
--
-- Nessun backfill: prima di questa migration esistevano solo Price mensili,
-- ma le righe one-off non sono distinguibili a posteriori senza rileggere
-- Stripe — meglio NULL onesto che 'month' presunto.
-- =============================================================================

ALTER TABLE public.customer_invoices
    ADD COLUMN IF NOT EXISTS billing_interval text NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.customer_invoices'::regclass
          AND conname  = 'customer_invoices_billing_interval_check'
    ) THEN
        ALTER TABLE public.customer_invoices
            ADD CONSTRAINT customer_invoices_billing_interval_check
                CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year'));
    END IF;
END $$;

COMMENT ON COLUMN public.customer_invoices.billing_interval IS
    'Intervallo di fatturazione coperto dall''incasso (month | year), letto dal '
    'Price della riga di periodo della fattura Stripe via plan_prices, fallback '
    'tenants.billing_interval. NULL = riga storica o fattura one-off (delta sedi).';

COMMIT;
