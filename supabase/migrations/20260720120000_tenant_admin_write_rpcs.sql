-- =============================================================================
-- update_tenant_name / update_tenant_billing_details — admin write path
-- =============================================================================
--
-- Bug: updateTenantName / updateTenantBillingDetails (src/services/supabase/
-- tenants.ts) update `tenants` directly. RLS UPDATE policy ("Tenant can
-- update own tenants") is hardcoded owner_user_id = auth.uid(), independent
-- of tenant.manage grants. Frontend gates BusinessSettingsPage on
-- tenant.manage (owner+admin), so an admin passes the UI gate but the direct
-- UPDATE silently touches 0 rows (the `.select("id")` probe throws, but the
-- write never happened) — silent failure, not a crash.
--
-- Fix mirrors update_tenant_story_settings (20260708100000): SECURITY
-- DEFINER RPC that manually re-implements authz instead of relying on
-- tenants RLS. RLS itself stays owner-only (unchanged, not widened).
--
-- Authz: p_tenant_id IN get_my_tenant_ids() FIRST (clamps to a tenant the
-- caller actually belongs to), THEN has_permission_any_activity('tenant.manage',
-- p_tenant_id) — NOT plain has_permission('tenant.manage', NULL). has_permission's
-- tenant-role branch checks "is owner/admin of SOME tenant with a
-- role_permissions grant", without referencing p_tenant_id at all (see
-- 20260526170000_permissions_foundation.sql:237-260) — combined with the
-- get_my_tenant_ids() clamp (any membership, any role, on p_tenant_id) that
-- allows a cross-tenant escalation: admin of tenant A + viewer of tenant B
-- passes both checks and can write to B. has_permission_any_activity keys
-- all 3 branches on p_tenant_id explicitly (verified in its latest def,
-- 20260529100000_fix_has_permission_any_activity_inlining.sql) — same
-- helper update_tenant_story_settings already uses. get_my_tenant_ids()
-- clamp kept as defense in depth (belt-and-suspenders, same rationale as
-- update_tenant_story_settings).
--
-- Whitelist: ONLY the columns already touched by the two service functions.
-- Explicitly OUT of scope (owner/admin cannot touch via this RPC):
-- owner_user_id, stripe_*, subscription_*, paid_seats, trial_until,
-- deleted_at, story_* (separate RPC), logo_url (separate RPC).
--
-- ⚠️ APPLICAZIONE: CREATE FUNCTION + REVOKE/GRANT nello stesso file →
-- `supabase db push` fallisce con SQLSTATE 42601. Applicare via Studio SQL
-- Editor, poi `supabase migration repair --status applied`.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_tenant_name(
    p_tenant_id UUID,
    p_name      TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (
        p_tenant_id IN (SELECT public.get_my_tenant_ids())
        AND public.has_permission_any_activity('tenant.manage', p_tenant_id)
    ) THEN
        RAISE EXCEPTION 'insufficient_permission' USING ERRCODE = '42501';
    END IF;

    UPDATE public.tenants
    SET name = p_name
    WHERE id = p_tenant_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.update_tenant_name(UUID, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_name(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_tenant_billing_details(
    p_tenant_id            UUID,
    p_legal_entity_type    TEXT,
    p_legal_name           TEXT,
    p_vat_number           TEXT,
    p_fiscal_code          TEXT,
    p_first_name           TEXT,
    p_last_name            TEXT,
    p_pec                  TEXT,
    p_codice_destinatario  TEXT,
    p_address              TEXT,
    p_street_number        TEXT,
    p_postal_code          TEXT,
    p_city                 TEXT,
    p_province             TEXT,
    p_country              TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (
        p_tenant_id IN (SELECT public.get_my_tenant_ids())
        AND public.has_permission_any_activity('tenant.manage', p_tenant_id)
    ) THEN
        RAISE EXCEPTION 'insufficient_permission' USING ERRCODE = '42501';
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
$$;

REVOKE ALL    ON FUNCTION public.update_tenant_billing_details(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_billing_details(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
