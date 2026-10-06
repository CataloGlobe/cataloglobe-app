-- =============================================================================
-- CRM interno: fasi con telefonata e demo separate
-- =============================================================================
-- Decisione di Alex del 2026-10-01 (domanda 7 della Fase 1, wiki pipeline-crm):
-- il giro ha due passi, prima la telefonata e poi la demo, e il passaggio tra
-- i due va visto e misurato. Prima delle ADV (6-8/10), così i numeri partono
-- puliti.
--
--   appuntamento    → telefonata_fissata
--   chiamata_fatta  → telefonata_fatta
--   nuove           : demo_fissata, demo_fatta (tra Telefonata fatta e In prova)
--
-- Si può saltare in avanti (demo nella stessa telefonata): nessuna regola sui
-- passaggi, come oggi.
-- Nessuna funzione da ricreare: le crm_* nominano solo nuovo, contattato,
-- perso, in_prova e cliente_pagante. Anche gli eventi già scritti passano
-- alle chiavi nuove, così la storia legge le etichette giuste.
-- ⚠️ SYNC con CRM_STAGES (src/types/crm.ts), _shared/crmLabels.ts e RANK in
-- _shared/crmAccountSync.ts.
-- =============================================================================

BEGIN;

ALTER TABLE public.crm_venues DROP CONSTRAINT IF EXISTS crm_venues_stage_check;

UPDATE public.crm_venues SET stage = 'telefonata_fissata' WHERE stage = 'appuntamento';
UPDATE public.crm_venues SET stage = 'telefonata_fatta' WHERE stage = 'chiamata_fatta';

ALTER TABLE public.crm_venues ADD CONSTRAINT crm_venues_stage_check CHECK (stage IN (
    'nuovo', 'contattato', 'in_conversazione',
    'telefonata_fissata', 'telefonata_fatta', 'demo_fissata', 'demo_fatta',
    'in_prova', 'cliente_pagante', 'perso'
));

-- Storia: le chiavi delle fasi nei payload (from/to dei cambi, stage dei
-- ritorni).
UPDATE public.crm_events e
SET payload = (
    SELECT jsonb_object_agg(
        k,
        CASE
            WHEN k IN ('from', 'to', 'stage') AND v = to_jsonb('appuntamento'::text) THEN to_jsonb('telefonata_fissata'::text)
            WHEN k IN ('from', 'to', 'stage') AND v = to_jsonb('chiamata_fatta'::text) THEN to_jsonb('telefonata_fatta'::text)
            ELSE v
        END
    )
    FROM jsonb_each(e.payload) AS p(k, v)
)
WHERE e.type IN ('stage_changed', 'stage_locked', 'lead_returned')
  AND (e.payload ->> 'from' IN ('appuntamento', 'chiamata_fatta')
       OR e.payload ->> 'to' IN ('appuntamento', 'chiamata_fatta')
       OR e.payload ->> 'stage' IN ('appuntamento', 'chiamata_fatta'));

COMMIT;
