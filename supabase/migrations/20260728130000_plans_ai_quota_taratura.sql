-- =============================================================================
-- plans.ai_quota_nanos_usd_per_seat — taratura definitiva (sostituisce i
-- segnaposto di 20260722110000_plans_ai_quota_column.sql)
-- =============================================================================
--
-- Derivazione (dati reali, non stimati): operazione di riferimento = import +
-- traduzione integrale in 4 lingue di un menù da 164 prodotti / 13.580
-- caratteri ≈ $1,37 totali, dominata dal costo DeepL (non da Gemini). La quota
-- di ogni piano copre ~3 operazioni complete di questo tipo al mese; il
-- consumo ricorrente reale è solo il delta sui prodotti nuovi/modificati, non
-- l'intero catalogo ad ogni ciclo — 3 operazioni complete è quindi un
-- margine, non una stima stretta.
--
-- Target: 10% dell'incasso mensile per sede.
--   base: €39/mese → 10% ≈ $4.00/sede/ciclo → 4 000 000 000 nano-USD
--   pro:  €59/mese → 10% ≈ $6.00/sede/ciclo → 6 000 000 000 nano-USD
--
-- Prossime ritarature: SOLO UPDATE su questa colonna (DB-driven per design,
-- vedi 20260722110000), nessun deploy. Questa migration esiste per portare
-- prod dai valori segnaposto (1/2 USD) a quelli definitivi sopra — non è essa
-- stessa il meccanismo di ritaratura futuro.
-- =============================================================================

COMMENT ON COLUMN public.plans.ai_quota_nanos_usd_per_seat IS
    'Allocazione quota AI per sede per ciclo, in nano-USD. Tarata al 10% '
    'dell''incasso mensile per sede (base $4 / pro $6), derivata da un caso '
    'reale: import + traduzione 4 lingue di un menù da 164 prodotti/13.580 '
    'caratteri ≈ $1,37 (dominato da DeepL) — la quota copre ~3 operazioni '
    'complete al mese, il consumo ricorrente è solo il delta. Quota tenant = '
    'questo × tenants.paid_seats. NULL = quota non configurata. Consumato '
    'SOLO da get_ai_usage_current_cycle (FASE 4). Ritaratura = UPDATE, nessun '
    'deploy.';

UPDATE public.plans SET ai_quota_nanos_usd_per_seat = 4000000000 WHERE code = 'base';
UPDATE public.plans SET ai_quota_nanos_usd_per_seat = 6000000000 WHERE code = 'pro';
