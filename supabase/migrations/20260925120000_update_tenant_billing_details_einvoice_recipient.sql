-- =============================================================================
-- RPC: update_tenant_billing_details — gate recapito e-fattura.
-- =============================================================================
--
-- Corpo ripreso da pg_get_functiondef sul live di staging (2026-09-25,
-- md5(prosrc) 1510173f8f78962617a027b52e407b9a), NON dalla migration
-- 20260923120300. Unica modifica: dopo il gate P.IVA, con una P.IVA
-- valorizzata serve almeno uno tra codice_destinatario e pec (stessa regola
-- di stripe-checkout: `missing_einvoice_recipient`, per ogni
-- legal_entity_type, presenza dopo trim, nessun controllo di formato).
-- ERRCODE 22023 come invalid_vat_number: il message discrimina.
-- Invariati: firma, SECURITY DEFINER, search_path '', guard permessi,
-- colonne aggiornate.
--
-- Il create del wizard (INSERT diretto su tenants) NON passa di qui.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_tenant_billing_details(p_tenant_id uuid, p_legal_entity_type text, p_legal_name text, p_vat_number text, p_fiscal_code text, p_first_name text, p_last_name text, p_pec text, p_codice_destinatario text, p_address text, p_street_number text, p_postal_code text, p_city text, p_province text, p_country text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF NOT (
        p_tenant_id IN (SELECT public.get_my_tenant_ids())
        AND public.has_permission_any_activity('tenant.manage', p_tenant_id)
    ) THEN
        RAISE EXCEPTION 'insufficient_permission' USING ERRCODE = '42501';
    END IF;

    -- Gate P.IVA: se valorizzata deve avere 11 cifre + check digit valido.
    IF NOT public.is_valid_partita_iva(p_vat_number) THEN
        RAISE EXCEPTION 'invalid_vat_number' USING ERRCODE = '22023';
    END IF;

    -- Gate recapito e-fattura: con una P.IVA serve Codice Destinatario SDI o PEC.
    IF COALESCE(btrim(p_vat_number), '') <> ''
       AND COALESCE(btrim(p_codice_destinatario), '') = ''
       AND COALESCE(btrim(p_pec), '') = '' THEN
        RAISE EXCEPTION 'missing_einvoice_recipient' USING ERRCODE = '22023';
    END IF;

    UPDATE public.tenants
    SET legal_entity_type   = p_legal_entity_type,
        legal_name          = p_legal_name,
        vat_number          = p_vat_number,
        fiscal_code         = p_fiscal_code,
        first_name          = p_first_name,
        last_name           = p_last_name,
        pec                 = p_pec,
        codice_destinatario = p_codice_destinatario,
        address             = p_address,
        street_number       = p_street_number,
        postal_code         = p_postal_code,
        city                = p_city,
        province            = p_province,
        country             = p_country
    WHERE id = p_tenant_id;
END;
$function$;
