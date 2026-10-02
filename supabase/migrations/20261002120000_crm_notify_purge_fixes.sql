-- =============================================================================
-- CRM interno: due correzioni chieste da Lorenzo prima della produzione
-- =============================================================================
-- 1. Solleciti arretrati. L'outbox di crm-notify segna come notificati, senza
--    messaggio, i lead ricevuti più di 24 ore prima (un arretrato non inonda
--    il bot), ma lasciava `escalated_at` vuoto: al primo collegamento di
--    Telegram il sollecito partiva per ognuno di quelli degli ultimi 7 giorni
--    (la copia della landing ne porta dentro parecchi). Da ora l'edge scrive
--    anche `escalated_at` quando salta un lead vecchio, come l'import CSV
--    silenzioso; qui si sistemano le righe già in quello stato.
--
-- 2. Marcatori dei lead Meta. crm_purge_venues cancellava le righe di
--    crm_imported_refs delle fonti senza copia (Meta, WhatsApp, manuale) dopo
--    12 mesi dall'ingresso: un CSV vecchio reimportato faceva rinascere un
--    locale cancellato. Ora quelle righe restano per sempre (solo l'id nella
--    fonte, nessun dato personale). Resta la pulizia dei marcatori della
--    landing la cui richiesta in `public.leads` non c'è più: quella richiesta
--    non può più tornare.
--    Corpo ripreso da pg_get_functiondef su staging (2026-10-02); cambia solo
--    il DELETE finale. CREATE OR REPLACE conserva i privilegi di
--    20261001160100, quindi niente GRANT qui.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Solleciti arretrati
-- -----------------------------------------------------------------------------
UPDATE public.crm_leads
SET escalated_at = notified_at
WHERE escalated_at IS NULL
  AND notified_at IS NOT NULL
  AND notified_at - received_at > interval '24 hours';

-- -----------------------------------------------------------------------------
-- 2. crm_purge_venues senza cancellare i marcatori delle fonti senza copia
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_purge_venues(p_cutoff timestamp with time zone, p_dry_run boolean DEFAULT true)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_count integer;
BEGIN
    IF p_cutoff IS NULL OR p_cutoff > now() - interval '11 months' THEN
        -- Difesa contro una soglia sbagliata passata dall'edge.
        RAISE EXCEPTION 'invalid_cutoff' USING ERRCODE = '22023';
    END IF;

    -- Un solo statement: il DELETE (CTE che modifica) gira anche se non
    -- letto, e salta tutto in dry-run.
    WITH targets AS (
        SELECT v.id
        FROM public.crm_venues v
        WHERE v.tenant_id IS NULL
          AND v.stage NOT IN ('in_prova', 'cliente_pagante')
          AND coalesce(
                  (SELECT max(l.received_at) FROM public.crm_leads l WHERE l.venue_id = v.id),
                  v.created_at
              ) < p_cutoff
    ),
    deleted AS (
        DELETE FROM public.crm_venues v
        USING targets t
        WHERE v.id = t.id
          AND NOT p_dry_run
        RETURNING v.id
    )
    SELECT count(*) INTO v_count FROM targets;

    -- Solo la landing: le altre fonti (lead Meta, WhatsApp, manuale) non
    -- hanno una copia da cui ricontrollare, il marcatore resta per sempre.
    IF NOT p_dry_run THEN
        DELETE FROM public.crm_imported_refs ir
        WHERE ir.source = 'landing'
          AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id::text = ir.source_ref);
    END IF;

    RETURN v_count;
END;
$function$;

COMMIT;
