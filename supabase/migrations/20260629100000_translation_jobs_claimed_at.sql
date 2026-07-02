-- =============================================================================
-- FASE 2a / Migration A — translation_jobs.claimed_at
-- =============================================================================
--
-- Aggiunge il timestamp di "presa in carico" mancante (audit FASE 1): oggi un
-- job che passa pending -> processing non lascia traccia temporale, quindi un
-- processing orfanato da un tick morto e' indistinguibile da uno fresco e non
-- viene mai ripescato (incident 142 orfani 2026-06-29, 804 del 2026-06-25).
--
-- claimed_at viene valorizzato dalla claim al momento della transizione
-- ->processing (Migration B). Nullable senza default:
--   - i pending attuali/futuri restano nel ramo pending (claimed_at IS NULL),
--     zero impatto, nessun backfill;
--   - i 142 processing orfani pre-colonna avranno claimed_at IS NULL -> trattati
--     come immediatamente eleggibili al reclaim (auto-sananti, vedi Migration B).
--
-- Niente CREATE FUNCTION qui: nessun rischio SQLSTATE 42601 su questa migration.
-- =============================================================================

ALTER TABLE public.translation_jobs
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.translation_jobs.claimed_at IS
    'Timestamp dell''ultima transizione ->processing operata dalla claim '
    '(claim_pending_translation_jobs). NULL per i pending non ancora presi e '
    'per i processing orfani pre-colonna. Usato dal reclaim age-based per '
    'distinguere un processing in volo da uno orfanato.';

-- Supporta lo scan di reclaim: la claim filtra status='processing' su claimed_at.
CREATE INDEX IF NOT EXISTS translation_jobs_reclaim_idx
    ON public.translation_jobs (claimed_at)
    WHERE status = 'processing';
