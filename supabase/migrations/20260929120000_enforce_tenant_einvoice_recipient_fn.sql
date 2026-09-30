-- =============================================================================
-- Gate fiscale a livello tabella: recapito e-fattura obbligatorio con P.IVA.
-- =============================================================================
--
-- Con una P.IVA valorizzata serve almeno uno tra codice_destinatario (SDI) e
-- pec. Stessa regola e stesso trim della RPC update_tenant_billing_details
-- (mig 20260925120000) e del gate di stripe-checkout
-- (`missing_einvoice_recipient`), stesso ERRCODE 22023 della RPC: il message
-- discrimina.
--
-- Perché a livello tabella: la RPC non copre due percorsi di scrittura.
--   1. L'INSERT del wizard di creazione azienda (policy INSERT = solo
--      owner_user_id = auth.uid()).
--   2. L'UPDATE diretto dell'owner (policy UPDATE owner + grant su tutte le
--      colonne): un PATCH di pec / codice_destinatario a NULL salta la RPC.
--
-- Perché trigger e non CHECK: un CHECK, anche NOT VALID, viene verificato a
-- ogni UPDATE della riga, qualunque colonna cambi. Sui tenant già privi di
-- recapito (6 attivi e paganti su staging al 2026-09-29) bloccherebbe il
-- webhook Stripe che aggiorna subscription_status, il rename, il logo.
-- Il trigger (file successivo) scatta solo su INSERT e su UPDATE OF
-- vat_number, pec, codice_destinatario: i violatori esistenti restano
-- modificabili finché non toccano i dati fiscali.
--
-- SECURITY INVOKER: legge solo NEW, nessun privilegio necessario.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_tenant_einvoice_recipient()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
BEGIN
    IF COALESCE(btrim(NEW.vat_number), '') <> ''
       AND COALESCE(btrim(NEW.codice_destinatario), '') = ''
       AND COALESCE(btrim(NEW.pec), '') = '' THEN
        RAISE EXCEPTION 'missing_einvoice_recipient' USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
END;
$function$;
