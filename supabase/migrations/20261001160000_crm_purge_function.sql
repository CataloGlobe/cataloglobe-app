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
--   * nessun account collegato (tenant_id nullo);
--   * nessun suo ingresso dalla landing ha ancora la riga in `public.leads`
--     (spam escluso). Altrimenti crm_sync_landing_leads, al minuto dopo, lo
--     ricopierebbe come lead nuovo con notifica Telegram. `purge-leads` (03:45
--     UTC) cancella quelle righe dopo 12 mesi; il locale va via la notte stessa,
--     dopo di lei. Chi in `leads` è 'won' resta, e con lui la sua carta.
--
-- p_dry_run (default true): conta e non cancella.
-- La chiama solo l'edge crm-purge con la service role (che ha SELECT su
-- `leads`). SECURITY INVOKER; ACL in 20261001160100 (42601 con db push).
--
-- Aperto (verifica GDPR entro il 21/10): uno stop definitivo (Perso, tipo
-- stop) cancellato qui non lascia traccia; serve una lista di esclusione.
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
          AND NOT EXISTS (
              SELECT 1
              FROM public.crm_leads cl
              JOIN public.leads pl ON pl.id::text = cl.source_ref
              WHERE cl.venue_id = v.id
                AND cl.source = 'landing'
                AND pl.status <> 'spam'
          )
    ),
    deleted AS (
        DELETE FROM public.crm_venues v
        USING targets t
        WHERE v.id = t.id
          AND NOT p_dry_run
        RETURNING v.id
    )
    SELECT count(*) INTO v_count FROM targets;

    RETURN v_count;
END;
$$;
