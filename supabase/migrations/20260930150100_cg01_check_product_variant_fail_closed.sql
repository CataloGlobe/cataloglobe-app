-- =============================================================================
-- CG-01: trg_check_product_variant fail-closed.
-- =============================================================================
--
-- Base: pg_get_functiondef su staging il 2026-09-30 (prima di portarla su prod
-- confrontare con pg_get_functiondef di prod: devono coincidere).
--
-- Problema: la funzione è SECURITY INVOKER e confronta con `!=`. Se il parent
-- appartiene a un altro tenant, la SELECT passa dalle RLS di products e non
-- trova la riga: v_parent_tenant_id resta NULL, `new.tenant_id != NULL` è
-- NULL, l'IF non scatta e la variante viene creata agganciata al prodotto di
-- un'altra azienda.
--
-- Fix: parent non trovato → errore; confronto con IS DISTINCT FROM. ERRCODE
-- 42501 sui due rami di tenant (stesso codice delle policy RLS). Regola B
-- (niente varianti di varianti) invariata. Resta SECURITY INVOKER: con la
-- visibilità del chiamante un parent invisibile è già un rifiuto.
--
-- Idempotente: CREATE OR REPLACE sulla stessa firma, grant preservati.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_check_product_variant()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_parent_tenant_id uuid;
    v_parent_parent_id uuid;
BEGIN
    IF new.parent_product_id IS NOT NULL THEN
        SELECT tenant_id, parent_product_id
          INTO v_parent_tenant_id, v_parent_parent_id
          FROM public.products
         WHERE id = new.parent_product_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'parent product % not found for this tenant', new.parent_product_id
                USING ERRCODE = '42501';
        END IF;

        -- Rule A: variant must belong to the same tenant as its parent
        IF new.tenant_id IS DISTINCT FROM v_parent_tenant_id THEN
            RAISE EXCEPTION 'variant tenant_id (%) does not match parent tenant_id (%)',
                new.tenant_id, v_parent_tenant_id
                USING ERRCODE = '42501';
        END IF;

        -- Rule B: variants of variants are not allowed (max depth = 1)
        IF v_parent_parent_id IS NOT NULL THEN
            RAISE EXCEPTION 'cannot create a variant of a variant (product id: %)',
                new.parent_product_id;
        END IF;
    END IF;

    RETURN new;
END;
$function$;
