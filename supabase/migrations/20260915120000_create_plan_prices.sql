BEGIN;

-- =============================================================================
-- plan_prices — un Price Stripe per combinazione (piano, intervallo)
-- =============================================================================
--
-- Prerequisito dell'abbonamento annuale (passo 1). Oggi `plans.stripe_price_id`
-- e' una sola colonna: la relazione piano→Price e' 1:1 e l'intervallo di
-- fatturazione non e' esprimibile. La risoluzione inversa (Price→piano, usata
-- dal webhook e da stripe-change-subscription) e' un'uguaglianza su quella
-- colonna: un Price annuale non risolverebbe a nessun piano e `tenants.plan`
-- resterebbe stale (quota AI, gating Pro, archivio fiscale sul piano sbagliato).
--
-- Modello: tabella dedicata, una riga per (plan_code, billing_interval).
--   - UNIQUE (plan_code, billing_interval): una combinazione non si ripete.
--   - UNIQUE (stripe_price_id): un Price appartiene a una sola riga.
--   - billing_interval usa i valori di Stripe `recurring.interval`
--     ('month' | 'year'): nessuna mappatura nei mirror edge.
--   - price_cents = prezzo unitario della PRIMA sede per l'intervallo
--     (mensile 3900, annuale 39000). Sconto multi-sede e soglia restano su
--     `plans` (agnostici all'intervallo).
--   - Rotazione di un Price (es. tax_behavior diverso) = UPDATE della riga,
--     non seconda riga: nessuna colonna is_active finche' non serve uno storico.
--
-- Seed: SOLO le due righe 'month' copiate da `plans` (stripe_price_id +
-- monthly_price_cents). Le righe 'year' vengono inserite a mano dopo la
-- creazione dei Price annuali sul dashboard Stripe.
--
-- `plans.stripe_price_id` e `plans.monthly_price_cents` restano (deprecate,
-- vedi 20260915120100) e vengono rimosse in un passo successivo, dopo la
-- migrazione dei lettori FE.
--
-- RLS: lookup table pubblica come `plans`/`addons` — SELECT per authenticated,
-- nessuna policy di scrittura (solo service_role). Nessun dato sensibile: i
-- Price ID sono gia' leggibili su `plans`.
-- =============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Tabella
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plan_prices (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_code        text        NOT NULL,
    billing_interval text        NOT NULL,
    stripe_price_id  text        NOT NULL,
    price_cents      integer     NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT plan_prices_plan_code_fkey
        FOREIGN KEY (plan_code) REFERENCES public.plans(code) ON DELETE RESTRICT,
    CONSTRAINT plan_prices_plan_interval_key   UNIQUE (plan_code, billing_interval),
    CONSTRAINT plan_prices_stripe_price_id_key UNIQUE (stripe_price_id),
    CONSTRAINT plan_prices_billing_interval_check
        CHECK (billing_interval IN ('month', 'year')),
    CONSTRAINT plan_prices_stripe_price_id_not_empty
        CHECK (length(trim(stripe_price_id)) > 0),
    CONSTRAINT plan_prices_price_cents_check
        CHECK (price_cents >= 0)
);

COMMENT ON TABLE public.plan_prices IS
    'Price Stripe per (piano, intervallo di fatturazione). Fonte di verita'' per '
    'la risoluzione piano+intervallo → Price (checkout) e Price → piano+intervallo '
    '(webhook, stripe-change-subscription). Sostituisce plans.stripe_price_id.';
COMMENT ON COLUMN public.plan_prices.billing_interval IS
    'Intervallo di fatturazione, stesso dominio di Stripe recurring.interval: month | year.';
COMMENT ON COLUMN public.plan_prices.price_cents IS
    'Prezzo unitario della prima sede per l''intervallo, in centesimi (es. 3900 '
    'mensile, 39000 annuale). Solo visualizzazione: il prezzo reale lo applica '
    'Stripe dai tier del Price. Sconto multi-sede e soglia restano su plans.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. updated_at trigger
-- ────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS set_updated_at_plan_prices ON public.plan_prices;
CREATE TRIGGER set_updated_at_plan_prices
    BEFORE UPDATE ON public.plan_prices
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RLS — lookup table: lettura per authenticated, scrittura solo service_role
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.plan_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read plan_prices" ON public.plan_prices;
CREATE POLICY "Authenticated can read plan_prices"
    ON public.plan_prices FOR SELECT TO authenticated
    USING (true);

-- NOTE: nessuna policy INSERT/UPDATE/DELETE → solo service_role puo' mutare.

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Seed — righe 'month' dai Price mensili gia' configurati su plans
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.plan_prices (plan_code, billing_interval, stripe_price_id, price_cents)
SELECT p.code, 'month', trim(p.stripe_price_id), p.monthly_price_cents
  FROM public.plans p
 WHERE p.stripe_price_id IS NOT NULL
   AND length(trim(p.stripe_price_id)) > 0
   AND p.monthly_price_cents IS NOT NULL
ON CONFLICT (plan_code, billing_interval) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Validazione
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    month_rows    int;
    plans_with_pid int;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'plan_prices'
          AND policyname = 'Authenticated can read plan_prices'
    ) THEN
        RAISE EXCEPTION 'FAIL: read policy on plan_prices missing.';
    END IF;

    SELECT COUNT(*) INTO month_rows
      FROM public.plan_prices WHERE billing_interval = 'month';
    SELECT COUNT(*) INTO plans_with_pid
      FROM public.plans
     WHERE stripe_price_id IS NOT NULL AND length(trim(stripe_price_id)) > 0
       AND monthly_price_cents IS NOT NULL;

    IF month_rows <> plans_with_pid THEN
        RAISE EXCEPTION 'FAIL: plan_prices month rows (%) <> plans with stripe_price_id (%).',
            month_rows, plans_with_pid;
    END IF;

    -- Ogni riga 'month' deve coincidere col Price ancora presente su plans:
    -- e' l'invariante "nulla cambia per il mensile" del passo 1.
    IF EXISTS (
        SELECT 1
          FROM public.plan_prices pp
          JOIN public.plans p ON p.code = pp.plan_code
         WHERE pp.billing_interval = 'month'
           AND (pp.stripe_price_id <> trim(p.stripe_price_id)
                OR pp.price_cents <> p.monthly_price_cents)
    ) THEN
        RAISE EXCEPTION 'FAIL: plan_prices month rows diverge from plans.';
    END IF;

    RAISE NOTICE 'OK: plan_prices created with % month row(s), aligned with plans.', month_rows;
END $$;

COMMIT;
