-- =============================================================================
-- CRM interno (Fase 0): conservazione 12 mesi
-- =============================================================================
-- crm_purge_venues cancella i locali del CRM fermi da più di 12 mesi; contatti,
-- ingressi, eventi, messaggi Telegram e proposte di collegamento se ne vanno a
-- cascata (FK ON DELETE CASCADE verso crm_venues). Un locale si cancella solo
-- se valgono TUTTE le condizioni:
--   * la data più recente tra l'ultimo ingresso (crm_leads.received_at) e
--     last_activity_at è prima di p_cutoff: un lead che torna non si perde;
--   * la fase non è In prova né Cliente pagante;
--   * nessun account collegato (tenant_id nullo).
-- Un locale Perso per stop lascia l'impronta dei suoi telefoni in
-- crm_suppressions (trigger crm_venues_suppress_stop, 20261001120100): dopo la
-- cancellazione non rientra da nessuna fonte. Un contatto della landing
-- ancora in `public.leads` non viene ricopiato: il marcatore
-- crm_landing_imported non ha FK e resta.
--
-- Pulizia dei marcatori: una riga di crm_landing_imported serve solo finché
-- il suo `leads.id` esiste (purge-leads, 03:45 UTC, lo toglie dopo 12 mesi).
-- Quelle orfane si cancellano qui (non in dry-run). Nessun dato personale,
-- ma non c'è motivo di tenerle.
--
-- p_dry_run (default true): conta e non cancella.
-- La chiama solo l'edge crm-purge con la service role (che ha SELECT su
-- `leads`). SECURITY INVOKER; ACL in 20261001160100 (42601 con db push).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.crm_purge_venues(
    p_cutoff   timestamptz,
    p_dry_run  boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
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
          AND greatest(
                  v.last_activity_at,
                  (SELECT max(l.received_at) FROM public.crm_leads l WHERE l.venue_id = v.id)
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

    IF NOT p_dry_run THEN
        DELETE FROM public.crm_landing_imported li
        WHERE NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = li.lead_id);
    END IF;

    RETURN v_count;
END;
$$;
