-- =============================================================================
-- plans.ai_quota_nanos_usd_per_seat — semantica "per mese", non "per ciclo"
-- =============================================================================
--
-- Solo COMMENT: il valore non cambia (base $4 / pro $6, già tarati sul mese,
-- vedi 20260728130000). Con 20260913100000 la finestra della quota è un
-- sotto-periodo mensile indipendente dall'intervallo di fatturazione, quindi
-- "per ciclo" sarebbe fuorviante su un abbonamento annuale.
-- =============================================================================

COMMENT ON COLUMN public.plans.ai_quota_nanos_usd_per_seat IS
    'Allocazione quota AI per sede PER MESE, in nano-USD — indipendente '
    'dall''intervallo di fatturazione (mensile o annuale), reset mensile, '
    'nessun rollover. Tarata al 10% dell''incasso mensile per sede (base $4 / '
    'pro $6), derivata da un caso reale: import + traduzione 4 lingue di un '
    'menù da 164 prodotti/13.580 caratteri ≈ $1,37 (dominato da DeepL) — la '
    'quota copre ~3 operazioni complete al mese, il consumo ricorrente è solo '
    'il delta. Quota tenant = questo × tenants.paid_seats. NULL = quota non '
    'configurata (fail-closed). Consumato SOLO da get_ai_usage_current_cycle. '
    'Ritaratura = UPDATE, nessun deploy.';
