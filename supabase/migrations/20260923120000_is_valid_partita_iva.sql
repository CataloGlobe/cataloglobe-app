-- =============================================================================
-- is_valid_partita_iva(text) — check digit P.IVA come funzione SQL riusabile.
-- =============================================================================
--
-- Stessa regola della RPC update_tenant_billing_details (20260920120000):
--   - NULL o stringa vuota (dopo aver tolto gli spazi) → true: la P.IVA è
--     opzionale (persona fisica senza partita IVA);
--   - altrimenti 11 cifre + somma Luhn all'italiana (cifre in indice 0-based
--     dispari raddoppiate, -9 se > 9; somma multipla di 10).
--
-- Usata dal CHECK tenants_vat_number_valid (20260923120200) e dalla RPC
-- (20260923120300). ⚠️ SYNC con src/utils/fiscalValidators.ts e
-- supabase/functions/_shared/fiscalValidators.ts (isValidPartitaIva).
--
-- IMMUTABLE: dipende solo dall'argomento (requisito per usarla in un CHECK).
-- SECURITY INVOKER (default): non legge tabelle, nessun privilegio da elevare.
-- Grant in file separato (20260923120100): CREATE FUNCTION + GRANT nello
-- stesso file fa fallire `supabase db push` con 42601.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_valid_partita_iva(p_vat_number text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
    v_vat   text;
    v_sum   int := 0;
    v_digit int;
    i       int;
BEGIN
    v_vat := regexp_replace(COALESCE(p_vat_number, ''), '\s', '', 'g');

    IF v_vat = '' THEN
        RETURN true;
    END IF;

    IF v_vat !~ '^\d{11}$' THEN
        RETURN false;
    END IF;

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

    RETURN v_sum % 10 = 0;
END;
$$;
