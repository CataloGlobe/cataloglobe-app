-- =============================================================================
-- CRM interno (Fase 0): conservazione 12 mesi
-- =============================================================================
-- crm_purge_venues cancella i locali del CRM la cui ultima richiesta è di più
-- di 12 mesi fa, come dice l'informativa privacy («12 mesi dall'invio per chi
-- non diventa cliente», PrivacyPolicyPage, sezioni 02 e 05); contatti,
-- ingressi, eventi, messaggi Telegram e proposte di collegamento se ne vanno a
-- cascata (FK ON DELETE CASCADE verso crm_venues). Un locale si cancella solo
-- se valgono TUTTE le condizioni:
--   * l'ultimo invio (max crm_leads.received_at; senza lead, la creazione
--     del locale) è prima di p_cutoff. Conta l'invio, non l'attività del team
--     (note, telefonate, spostamenti): un lead che torna è un invio nuovo e
--     riparte da lì;
--   * la fase non è In prova né Cliente pagante;
--   * nessun account collegato (tenant_id nullo).
-- Un locale Perso per stop lascia l'impronta dei suoi telefoni in
-- crm_suppressions (trigger crm_venues_suppress_stop, 20261001120100): dopo la
-- cancellazione non rientra da nessuna fonte. Un contatto della landing
-- ancora in `public.leads`, o un lead Meta di un CSV reimportato, non viene
-- ricopiato: la sua riga in crm_imported_refs non ha FK e resta.
--
-- Pulizia di crm_imported_refs (non in dry-run), nessun dato personale ma
-- nessun motivo di tenerle oltre il necessario:
--   * landing: la riga serve solo finché il suo `leads.id` esiste
--     (purge-leads, 03:45 UTC, lo toglie dopo 12 mesi);
--   * altre fonti (id dei lead Meta): dopo 12 mesi dall'ingresso, ben oltre
--     il periodo in cui il Centro lead di Meta li rende scaricabili.
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

    IF NOT p_dry_run THEN
        DELETE FROM public.crm_imported_refs ir
        WHERE (ir.source = 'landing'
               AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id::text = ir.source_ref))
           OR (ir.source <> 'landing' AND ir.imported_at < p_cutoff);
    END IF;

    RETURN v_count;
END;
$$;
