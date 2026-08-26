-- =============================================================================
-- plans — allocazione quota AI per sede, in nano-USD (FASE 4, enforcement)
-- =============================================================================
--
-- Colonna DB-driven: la quota AI del ciclo si calcola come
--   quota_nanos_usd = ai_quota_nanos_usd_per_seat × tenants.paid_seats
-- (paid_seats = numero di sedi pagate). Consumo e quota confrontati in
-- nano-USD, stessa unità di ai_usage_events.cost_nanos_usd — nessuna
-- conversione valuta a runtime.
--
-- ⚠️ VALORI SEGNAPOSTO (PLACEHOLDER). NON sono tarati sui dati reali: servono
-- solo a rendere la meccanica live-testabile in questa fase. La taratura
-- definitiva (incasso × ratio × cambio, calcolata offline) sarà un semplice
-- UPDATE su questa colonna — nessun deploy.
--
-- Semantica NULL: quota_per_seat NULL ⇒ get_ai_usage_current_cycle risolve
-- status='blocked' (fail-CLOSED). Una quota mancante è un errore di config
-- NOSTRO e NON deve tradursi in consumo illimitato silenzioso — diverso dal
-- fail-OPEN su errore transitorio di lettura RPC (là si passa). I seed sotto
-- popolano entrambi i piani vivi così nessun tenant reale finisce bloccato per
-- config mancante; azzerare/abbassare per testare il blocco (note in 110300).
-- =============================================================================

ALTER TABLE public.plans
    ADD COLUMN IF NOT EXISTS ai_quota_nanos_usd_per_seat bigint;

COMMENT ON COLUMN public.plans.ai_quota_nanos_usd_per_seat IS
    'PLACEHOLDER — tarare sui dati reali. Allocazione quota AI per sede per '
    'ciclo, in nano-USD. Quota tenant = questo × tenants.paid_seats. NULL = '
    'quota non configurata (fail-open, status=ok). Consumato SOLO da '
    'get_ai_usage_current_cycle (FASE 4). Taratura = UPDATE, nessun deploy.';

-- Non-negatività (idempotente).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.plans'::regclass
          AND conname  = 'plans_ai_quota_nanos_usd_per_seat_check'
    ) THEN
        ALTER TABLE public.plans
            ADD CONSTRAINT plans_ai_quota_nanos_usd_per_seat_check
                CHECK (ai_quota_nanos_usd_per_seat IS NULL
                       OR ai_quota_nanos_usd_per_seat >= 0);
    END IF;
END $$;

-- ⚠️ Seed SEGNAPOSTO — numeri tondi e FINTI (1 USD = 1e9 nano-USD).
--   base: 1.00 USD/sede/ciclo · pro: 2.00 USD/sede/ciclo.
-- Solo per esercitare il gate; nessuna relazione con i costi reali.
UPDATE public.plans SET ai_quota_nanos_usd_per_seat = 1000000000 WHERE code = 'base';
UPDATE public.plans SET ai_quota_nanos_usd_per_seat = 2000000000 WHERE code = 'pro';
