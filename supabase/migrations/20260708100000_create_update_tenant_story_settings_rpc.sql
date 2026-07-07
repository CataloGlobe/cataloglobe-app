-- =============================================================================
-- update_tenant_story_settings — write path for the brand "cappello" fields
-- =============================================================================
--
-- Direct UPDATE on tenants is blocked for admin/manager: RLS UPDATE policy on
-- tenants ("Tenant can update own tenants") is hardcoded owner_user_id =
-- auth.uid(), independent of tenant.manage grants. Story cappello is gated on
-- stories.write (so manager can reach it too, unlike tenant.manage), so this
-- RPC re-implements authz manually instead of relying on tenants RLS.
--
-- Pattern mirrors replace_product_pairings (20260705120100):
--   - SECURITY DEFINER + SET search_path = '' (fully-qualified table refs).
--   - Manual authz: p_tenant_id IN get_my_tenant_ids() FIRST (clamps the
--     permission check to a tenant the caller actually belongs to — no
--     cross-tenant leak even if has_permission_any_activity were laxer),
--     THEN has_permission_any_activity('stories.write', p_tenant_id).
--   - Fail-closed: RAISE EXCEPTION with 42501 on any authz failure.
--   - UPDATE touches ONLY the 4 cappello columns, nothing else on tenants.
--
-- ⚠️ APPLICAZIONE: CREATE FUNCTION + REVOKE/GRANT nello stesso file →
-- `supabase db push` fallisce con SQLSTATE 42601. Applicare via Studio SQL
-- Editor, poi `supabase migration repair --status applied`.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_tenant_story_settings(
    p_tenant_id  UUID,
    p_story_cover TEXT,
    p_story_title TEXT,
    p_story_intro TEXT,
    p_website     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (
        p_tenant_id IN (SELECT public.get_my_tenant_ids())
        AND public.has_permission_any_activity('stories.write', p_tenant_id)
    ) THEN
        RAISE EXCEPTION 'insufficient_permission' USING ERRCODE = '42501';
    END IF;

    UPDATE public.tenants
    SET story_cover = p_story_cover,
        story_title = p_story_title,
        story_intro = p_story_intro,
        website     = p_website
    WHERE id = p_tenant_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.update_tenant_story_settings(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_story_settings(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
