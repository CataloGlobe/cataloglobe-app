-- =============================================================================
-- Trigger del gate recapito e-fattura su public.tenants.
-- =============================================================================
--
-- Funzione e motivazione: 20260929120000_enforce_tenant_einvoice_recipient_fn.
-- Separato dal CREATE FUNCTION per il 42601 di `supabase db push`
-- (docs/patterns/storage-sql.md).
--
-- UPDATE OF: scatta solo se lo statement nomina una delle tre colonne, così
-- webhook, rename e logo sui tenant già privi di recapito non si rompono.
-- Trigger, policy e CHECK esistenti su tenants restano invariati.
--
-- La funzione è solo di trigger: nessun EXECUTE per i ruoli client.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.enforce_tenant_einvoice_recipient() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_tenant_einvoice_recipient ON public.tenants;

CREATE TRIGGER trg_enforce_tenant_einvoice_recipient
    BEFORE INSERT OR UPDATE OF vat_number, pec, codice_destinatario ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_tenant_einvoice_recipient();
