-- =============================================================================
-- Fix legacy trigger functions still referencing v2_* table names
--
-- Background: migration 20260317120000_rename_v2_tables.sql renamed all 34
-- v2_* tables.  The two functions below were not included in that migration
-- because they are standalone (not called by get_public_catalog and not in
-- the explicitly tracked list). Their body text still references the old
-- prefixed names, which will cause plan re-compilation errors once the old
-- OIDs are gone.
--
-- Functions updated (same names, logic preserved):
--   1. expire_old_invites()         — v2_tenant_memberships → tenant_memberships
--   2. trg_check_v2_product_variant() — v2_products → products
--
-- Note: trg_check_v2_product_group_depth and trg_check_v2_product_group_items_tenant
-- were investigated and confirmed NOT to exist in any migration file; no action needed.
-- =============================================================================

-- 1. expire_old_invites
--    Original source: 20260313070000_v2_expire_old_invites.sql
CREATE OR REPLACE FUNCTION public.expire_old_invites()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE public.tenant_memberships
    SET status = 'expired'
    WHERE status = 'pending'
      AND invite_expires_at IS NOT NULL
      AND invite_expires_at < now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- 2. trg_check_v2_product_variant
--    Original source: 20260224160720_v2_products_hardening.sql
CREATE OR REPLACE FUNCTION public.trg_check_v2_product_variant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_parent_tenant_id uuid;
    v_parent_parent_id uuid;
BEGIN
    IF new.parent_product_id IS NOT NULL THEN
        SELECT tenant_id, parent_product_id
          INTO v_parent_tenant_id, v_parent_parent_id
          FROM public.products
         WHERE id = new.parent_product_id;

        -- Rule A: variant must belong to the same tenant as its parent
        IF new.tenant_id != v_parent_tenant_id THEN
            RAISE EXCEPTION 'variant tenant_id (%) does not match parent tenant_id (%)',
                new.tenant_id, v_parent_tenant_id;
        END IF;

        -- Rule B: variants of variants are not allowed (max depth = 1)
        IF v_parent_parent_id IS NOT NULL THEN
            RAISE EXCEPTION 'cannot create a variant of a variant (product id: %)',
                new.parent_product_id;
        END IF;
    END IF;

    RETURN new;
END;
$$;
