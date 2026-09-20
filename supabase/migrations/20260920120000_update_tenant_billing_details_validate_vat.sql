-- Validazione P.IVA bloccante nella RPC dei dati di fatturazione (difesa in
-- profondità: la UI di BusinessSettingsPage e il gate in stripe-checkout la
-- fanno già, questa chiude la porta anche a chiamate dirette alla RPC).
--
-- Stesso check-digit "Luhn all'italiana" di src/utils/fiscalValidators.ts e
-- supabase/functions/_shared/fiscalValidators.ts (⚠️ SYNC: modificare i tre
-- insieme). Solo P.IVA: il vincolo "con P.IVA serve SDI o PEC" resta su FE +
-- edge. Un solo statement (CREATE OR REPLACE) → db push non incappa nel 42601;
-- i grant esistenti sopravvivono al replace, nessun REVOKE/GRANT qui.
CREATE OR REPLACE FUNCTION public.update_tenant_billing_details(p_tenant_id uuid, p_legal_entity_type text, p_legal_name text, p_vat_number text, p_fiscal_code text, p_first_name text, p_last_name text, p_pec text, p_codice_destinatario text, p_address text, p_street_number text, p_postal_code text, p_city text, p_province text, p_country text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_vat text;
    v_sum int := 0;
    v_digit int;
    i int;
BEGIN
    IF NOT (
        p_tenant_id IN (SELECT public.get_my_tenant_ids())
        AND public.has_permission_any_activity('tenant.manage', p_tenant_id)
    ) THEN
        RAISE EXCEPTION 'insufficient_permission' USING ERRCODE = '42501';
    END IF;

    -- Gate P.IVA: se valorizzata deve avere 11 cifre + check digit valido.
    v_vat := regexp_replace(COALESCE(p_vat_number, ''), '\s', '', 'g');
    IF v_vat <> '' THEN
        IF v_vat !~ '^\d{11}$' THEN
            RAISE EXCEPTION 'invalid_vat_number' USING ERRCODE = '22023';
        END IF;
        -- Somma Luhn all'italiana: cifre in posizione pari (1-based dispari
        -- nell'indice 0-based) raddoppiate, sottraendo 9 se > 9.
        FOR i IN 0..10 LOOP
            v_digit := (substr(v_vat, i + 1, 1))::int;
            IF i % 2 = 1 THEN
                v_digit := v_digit * 2;
                IF v_digit > 9 THEN
                    v_digit := v_digit - 9;
                END IF;
            END IF;
            v_sum := v_sum + v_digit;
        END LOOP;
        IF v_sum % 10 <> 0 THEN
            RAISE EXCEPTION 'invalid_vat_number' USING ERRCODE = '22023';
        END IF;
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
