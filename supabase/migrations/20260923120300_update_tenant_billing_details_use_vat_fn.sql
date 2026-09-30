-- =============================================================================
-- RPC: update_tenant_billing_details — usa public.is_valid_partita_iva.
-- =============================================================================
--
-- Corpo ripreso da pg_get_functiondef sul live di staging (2026-09-23,
-- md5(prosrc) 22c4b70dce4dad5e58fef64c1dd8678d), NON dalla migration
-- 20260920120000. Unica modifica: il loop Luhn in linea è sostituito dalla
-- chiamata a public.is_valid_partita_iva (20260923120000), che applica la
-- stessa regola. Invariati: firma, SECURITY DEFINER, search_path '', guard
-- permessi (42501 insufficient_permission), errore invalid_vat_number con
-- ERRCODE 22023 (mappato dal FE), colonne aggiornate.
--
-- Il gate resta nella RPC anche col CHECK tenants_vat_number_valid in
-- place: dà al FE l'errore parlante 22023 invece del 23514 del vincolo.
--
-- CREATE OR REPLACE conserva l'ACL esistente (postgres, authenticated).
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
