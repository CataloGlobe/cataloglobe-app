-- =============================================================================
-- CRM: «rimanda a domani» dalla lista dei lead al telefono (canvas U8b)
-- =============================================================================
-- Il gesto verso sinistra scrive il prossimo passo con scadenza domani e lo
-- segna come rimando: il locale esce da «Da lavorare» fino al giorno del
-- passo. Un passo scritto dalla scheda («Cambia») non è un rimando e non
-- nasconde niente. Segue 20261005150300 (stessa PR, non ancora applicata).
-- =============================================================================

ALTER TABLE public.crm_next_steps
    ADD COLUMN IF NOT EXISTS snoozed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.crm_next_steps.snoozed IS
    'true = scritto dal gesto «rimanda a domani»: il locale esce da Da lavorare fino a due_on.';
