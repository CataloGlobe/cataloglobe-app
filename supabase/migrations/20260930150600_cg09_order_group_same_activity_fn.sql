-- =============================================================================
-- CG-09: il gruppo ordini deve appartenere alla stessa sede della riga (funzione).
-- =============================================================================
--
-- Problema: orders.order_group_id e customer_sessions.order_group_id hanno una
-- FK semplice verso order_groups(id), senza vincolo sulla sede. Una riga può
-- quindi riferire il gruppo di un'altra sede, e i trigger SECURITY DEFINER su
-- orders che aggiornano il gruppo (verifica e chiusura) agirebbero su un
-- gruppo che non appartiene alla sede della riga.
--
-- Fix: trigger BEFORE INSERT OR UPDATE OF order_group_id, activity_id (file
-- successivo) che rifiuta con 42501 un gruppo di un'altra sede.
-- order_group_id NULL passa. Gruppo inesistente → rifiuto (la FK lo farebbe
-- comunque).
--
-- order_group_id NULL è legittimo? (verificato 2026-09-30, codice + staging)
--   - orders: la colonna è nullable, ma nessun percorso crea un ordine senza
--     gruppo. Gli unici INSERT sono submit_order_atomic (usa il gruppo
--     indicato, poi quello della sessione, altrimenti ne crea uno: sempre
--     valorizzato) e rectify_order_atomic (copia il gruppo del padre). Il NULL
--     nasce solo dalla FK ON DELETE SET NULL quando il gruppo viene
--     cancellato. Staging: 0 ordini su 143 con gruppo NULL.
--   - customer_sessions: sì. La sessione nasce senza gruppo in resolve-table
--     e lo riceve al primo ordine (submit_order_atomic). Staging: 64 sessioni
--     su 122 con gruppo NULL.
--   Lasciar passare il NULL è quindi necessario per le sessioni e innocuo per
--   gli ordini: senza gruppo i trigger di verifica e chiusura escono subito. La coerenza sede ↔ tenant della riga la garantisce
-- enforce_activity_tenant_match (20260930150400).
--
-- Dati: 0 righe incoerenti su staging (orders, customer_sessions) al
-- 2026-09-30.
--
-- SECURITY DEFINER: la lettura di order_groups non deve dipendere dalla RLS
-- del chiamante (sessioni cliente, edge). Legge una riga per PK.
-- SET search_path TO '' con nomi qualificati.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_order_group_same_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_group_activity_id uuid;
BEGIN
    IF NEW.order_group_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT og.activity_id INTO v_group_activity_id
      FROM public.order_groups og
     WHERE og.id = NEW.order_group_id;

    IF v_group_activity_id IS DISTINCT FROM NEW.activity_id THEN
        RAISE EXCEPTION 'order_group_activity_mismatch'
            USING ERRCODE = '42501',
                  DETAIL  = format('%I.order_group_id deve appartenere alla sede %s',
                                   TG_TABLE_NAME, NEW.activity_id);
    END IF;

    RETURN NEW;
END;
$function$;
