-- ═══════════════════════════════════════════════════════════════
-- Aggiunge activities.ordering_enabled (BOOLEAN NOT NULL DEFAULT true)
-- per maintenance mode mid-session per-sede.
-- ═══════════════════════════════════════════════════════════════
-- Permette al ristoratore di sospendere ordinazioni QR per una sede
-- senza disattivare la sede (che la nasconderebbe completamente).
-- Default true: comportamento attuale invariato per dati esistenti.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.activities
    ADD COLUMN ordering_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.activities.ordering_enabled IS
    'Toggle maintenance mode ordinazioni QR per-sede. true=ordini abilitati, false=cliente vede menu ma submit bloccato.';

COMMIT;
