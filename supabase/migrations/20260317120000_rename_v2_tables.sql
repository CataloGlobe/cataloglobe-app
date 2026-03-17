-- =============================================================================
-- RENAME ALL v2_* TABLES, VIEWS, AND DEPENDENT OBJECTS
--
-- Removes the v2_ prefix from every active table and view.
-- V1 tables have already been removed; this is purely a cleanup rename.
--
-- What this migration does, in order:
--   1. Drop is_schedule_active() — its parameter type is v2_schedules, which
--      must be resolved at function-creation time.  Must go before the rename.
--   2. Drop both views — so they can be recreated with clean body text.
--   3. Rename all 34 tables.
--   4. Rename named indexes that carry the v2_ prefix (cosmetic, no
--      functional impact, but required for a clean schema going forward).
--   5. Rename triggers that carry the v2_ prefix (cosmetic only).
--   6. Recreate is_schedule_active() with the new parameter type.
--   7. Recreate every function whose body references any v2_* table name.
--      All use CREATE OR REPLACE, so the function OID is preserved and all
--      callers (triggers, RLS expressions) continue to work without change.
--   8. Recreate views with new names and updated body text.
--
-- What this migration does NOT do:
--   - Touch src/ frontend code.
--   - Touch supabase/functions/ edge function code.
--   - Rename RLS policy *names* (they reference tables by OID and remain
--     functional; cosmetic rename can be done in a follow-up migration).
--   - Rename unnamed CHECK or UNIQUE constraints (auto-generated names;
--     no functional or developer-visible impact).
--   - Rename unnamed FK constraints (same rationale).
--
-- Safe to run against the live database — all statements are wrapped in a
-- single transaction.  If any step fails the entire migration rolls back.
-- =============================================================================

BEGIN;


-- =============================================================================
-- STEP 1  Drop is_schedule_active before renaming v2_schedules
-- =============================================================================
-- This function declares its parameter as type public.v2_schedules.
-- PostgreSQL resolves that type to an OID at function-creation time.
-- Renaming the table first would leave the existing OID intact so the drop
-- would still succeed, but it is cleaner to drop the old version first and
-- recreate with the new type after the rename.
-- =============================================================================

DROP FUNCTION IF EXISTS public.is_schedule_active(public.v2_schedules);


-- =============================================================================
-- STEP 2  Drop views so they can be recreated with clean body text
-- =============================================================================
-- PostgreSQL stores view bodies as text AND compiles them to expression trees
-- that reference tables by OID.  After a table rename the views would still
-- execute correctly via OID, but their stored body text would still show the
-- stale v2_ names.  Dropping and recreating gives us clean bodies.
-- =============================================================================

DROP VIEW IF EXISTS public.v2_tenant_members_view;
DROP VIEW IF EXISTS public.v2_user_tenants_view;


-- =============================================================================
-- STEP 3  Rename tables
-- =============================================================================
-- In PostgreSQL, ALTER TABLE ... RENAME TO:
--   * Updates all FK constraint definitions (by OID — no cascade needed).
--   * Keeps all triggers, indexes, RLS policies and their associations intact.
--   * Does not move any data.
--
-- Order: leaf tables first (nothing else depends on them), root tables last.
-- This is not strictly required for correctness but makes the intent clear.
--
-- EXCLUDED: v2_activity_schedules — permanently DROPPED in migration
--           20260302130000; must not be referenced here.
-- =============================================================================

-- ---- Junction / leaf tables (no other v2_ table has an FK pointing into them) ----

ALTER TABLE public.v2_featured_content_products     RENAME TO featured_content_products;
ALTER TABLE public.v2_schedule_featured_contents    RENAME TO schedule_featured_contents;
ALTER TABLE public.v2_catalog_category_products     RENAME TO catalog_category_products;
ALTER TABLE public.v2_product_group_items           RENAME TO product_group_items;
ALTER TABLE public.v2_product_option_values         RENAME TO product_option_values;
ALTER TABLE public.v2_product_ingredients           RENAME TO product_ingredients;
ALTER TABLE public.v2_product_attribute_values      RENAME TO product_attribute_values;
ALTER TABLE public.v2_product_allergens             RENAME TO product_allergens;
ALTER TABLE public.v2_schedule_price_overrides      RENAME TO schedule_price_overrides;
ALTER TABLE public.v2_schedule_visibility_overrides RENAME TO schedule_visibility_overrides;
ALTER TABLE public.v2_schedule_targets              RENAME TO schedule_targets;
ALTER TABLE public.v2_activity_group_members        RENAME TO activity_group_members;
ALTER TABLE public.v2_activity_product_overrides    RENAME TO activity_product_overrides;
ALTER TABLE public.v2_audit_logs                    RENAME TO audit_logs;

-- ---- Legacy tables ----
-- v2_catalog_sections and v2_catalog_items were superseded by
-- v2_catalog_categories / v2_catalog_category_products in migration
-- 20260225121000.  No active frontend or edge-function code queries them.
-- They are renamed here to complete the v2_ prefix removal.
-- A separate cleanup migration should evaluate whether to DROP them entirely.
ALTER TABLE public.v2_catalog_sections RENAME TO catalog_sections;
ALTER TABLE public.v2_catalog_items    RENAME TO catalog_items;

-- ---- Mid-level tables (depended upon by leaf tables above) ----

ALTER TABLE public.v2_catalog_categories            RENAME TO catalog_categories;
ALTER TABLE public.v2_product_option_groups         RENAME TO product_option_groups;
ALTER TABLE public.v2_product_groups                RENAME TO product_groups;
ALTER TABLE public.v2_ingredients                   RENAME TO ingredients;
ALTER TABLE public.v2_product_attribute_definitions RENAME TO product_attribute_definitions;
ALTER TABLE public.v2_featured_contents             RENAME TO featured_contents;
ALTER TABLE public.v2_style_versions                RENAME TO style_versions;
ALTER TABLE public.v2_schedule_layout               RENAME TO schedule_layout;
ALTER TABLE public.v2_activity_groups               RENAME TO activity_groups;

-- ---- Root-adjacent tables ----

ALTER TABLE public.v2_allergens RENAME TO allergens;
ALTER TABLE public.v2_plans     RENAME TO plans;
ALTER TABLE public.v2_styles    RENAME TO styles;

-- ---- Core root tables (everything else references these) ----

ALTER TABLE public.v2_schedules         RENAME TO schedules;
ALTER TABLE public.v2_catalogs          RENAME TO catalogs;
ALTER TABLE public.v2_activities        RENAME TO activities;
ALTER TABLE public.v2_products          RENAME TO products;
ALTER TABLE public.v2_tenant_memberships RENAME TO tenant_memberships;
ALTER TABLE public.v2_tenants           RENAME TO tenants;


-- =============================================================================
-- STEP 4  Rename named indexes that carry the v2_ prefix
-- =============================================================================
-- Functionally no-op: indexes are already on the renamed tables via OID.
-- Renamed here so that \di and information_schema queries show clean names.
-- Only explicit named indexes seen in migration files are renamed; auto-named
-- primary-key / FK indexes (e.g. v2_products_pkey) are left to a follow-up.
-- =============================================================================

-- From 20260228174000_v2_product_options_multiprice.sql
ALTER INDEX IF EXISTS public.idx_v2_option_groups_tenant_product_kind
    RENAME TO idx_option_groups_tenant_product_kind;

ALTER INDEX IF EXISTS public.idx_v2_option_values_tenant_group
    RENAME TO idx_option_values_tenant_group;

-- From 20260312230000_v2_tenant_invite_tokens.sql
ALTER INDEX IF EXISTS public.v2_tenant_memberships_invite_token_idx
    RENAME TO tenant_memberships_invite_token_idx;

-- From 20260316010000_v2_audit_logs.sql
ALTER INDEX IF EXISTS public.v2_audit_logs_tenant_idx
    RENAME TO audit_logs_tenant_idx;

ALTER INDEX IF EXISTS public.v2_audit_logs_user_idx
    RENAME TO audit_logs_user_idx;

ALTER INDEX IF EXISTS public.v2_audit_logs_created_idx
    RENAME TO audit_logs_created_idx;


-- =============================================================================
-- STEP 5  Rename triggers that carry the v2_ prefix
-- =============================================================================
-- Triggers survive table renames and remain bound to the renamed table via OID.
-- These renames are cosmetic — they keep the schema self-consistent and make
-- the triggers discoverable under the new table names.
--
-- PostgreSQL does not support ALTER TRIGGER … IF EXISTS, so each rename is
-- wrapped in a DO block that checks pg_trigger first and skips silently when
-- the trigger is absent (e.g. was renamed manually in Studio beforehand).
-- =============================================================================

-- on tenants (was v2_tenants)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_v2_tenant_created') THEN
    ALTER TRIGGER on_v2_tenant_created ON public.tenants RENAME TO on_tenant_created;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_v2_tenant_created_system_group') THEN
    ALTER TRIGGER on_v2_tenant_created_system_group ON public.tenants RENAME TO on_tenant_created_system_group;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'v2_tenants_protect_deleted_at') THEN
    ALTER TRIGGER v2_tenants_protect_deleted_at ON public.tenants RENAME TO tenants_protect_deleted_at;
  END IF;
END $$;

-- on tenant_memberships (was v2_tenant_memberships)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'v2_tenant_memberships_set_updated_at') THEN
    ALTER TRIGGER v2_tenant_memberships_set_updated_at
        ON public.tenant_memberships
        RENAME TO tenant_memberships_set_updated_at;
  END IF;
END $$;

-- on product_groups (was v2_product_groups) — added in 20260225220321
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'v2_product_groups_set_updated_at') THEN
    ALTER TRIGGER v2_product_groups_set_updated_at
        ON public.product_groups
        RENAME TO product_groups_set_updated_at;
  END IF;
END $$;


-- =============================================================================
-- STEP 6  Recreate is_schedule_active with the new parameter type
-- =============================================================================
-- Must come after renaming v2_schedules → schedules (Step 3) so that
-- public.schedules is resolvable as a row type.
-- The function body is byte-for-byte identical to the original; only the
-- parameter type declaration changes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_schedule_active(s public.schedules)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_now  timestamptz := now() AT TIME ZONE 'Europe/Rome';
  v_time time        := (v_now)::time;
  v_dow  int         := extract(dow from v_now);
BEGIN

  IF s.enabled IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  -- ALWAYS
  IF s.time_mode = 'always' THEN
    RETURN TRUE;
  END IF;

  -- WINDOW (days + time range)
  IF s.time_mode = 'window' THEN
    IF s.days_of_week IS NOT NULL THEN
      IF NOT (v_dow = ANY (s.days_of_week)) THEN
        RETURN FALSE;
      END IF;
    END IF;
    IF s.time_from IS NOT NULL AND s.time_to IS NOT NULL THEN
      IF NOT (v_time BETWEEN s.time_from AND s.time_to) THEN
        RETURN FALSE;
      END IF;
    END IF;
    RETURN TRUE;
  END IF;

  -- RANGE (date interval)
  IF s.time_mode = 'range' THEN
    IF s.start_at IS NOT NULL AND v_now < s.start_at THEN
      RETURN FALSE;
    END IF;
    IF s.end_at IS NOT NULL AND v_now > s.end_at THEN
      RETURN FALSE;
    END IF;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;


-- =============================================================================
-- STEP 7  Recreate all functions whose bodies reference v2_* table names
-- =============================================================================
-- All recreations use CREATE OR REPLACE so the function OID is preserved.
-- Preserving the OID means every caller — triggers, RLS USING expressions,
-- other functions — continues to work without modification.
--
-- Functions are presented roughly in dependency order:
--   core helpers → trigger functions → invite/membership RPCs → big queries
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 7-A  get_my_tenant_ids
-- ---------------------------------------------------------------------------
-- Called by every RLS policy on every tenant-scoped table.
-- Must reference the renamed tables for correctness when the compiled plan
-- is ever invalidated (server restart, DISCARD PLANS, etc.).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Branch A: tenants where the caller is the owner
  SELECT t.id
  FROM public.tenants t
  WHERE t.owner_user_id = auth.uid()
    AND t.deleted_at IS NULL

  UNION

  -- Branch B: tenants where the caller has an active membership
  SELECT tm.tenant_id
  FROM public.tenant_memberships tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id  = auth.uid()
    AND tm.status   = 'active'
    AND t.deleted_at IS NULL
$$;


-- ---------------------------------------------------------------------------
-- 7-B  get_my_deleted_tenants
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_deleted_tenants()
RETURNS TABLE (
    id            uuid,
    name          text,
    vertical_type text,
    created_at    timestamptz,
    deleted_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        id,
        name,
        vertical_type,
        created_at,
        deleted_at
    FROM public.tenants
    WHERE owner_user_id = auth.uid()
      AND deleted_at IS NOT NULL
    ORDER BY deleted_at DESC;
$$;


-- ---------------------------------------------------------------------------
-- 7-C  handle_new_tenant_membership  (trigger function on tenants)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_tenant_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tenant_memberships (
    tenant_id,
    user_id,
    role,
    status
  ) VALUES (
    NEW.id,
    NEW.owner_user_id,
    'owner',
    'active'
  )
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- 7-D  handle_new_tenant_system_group  (trigger function on tenants)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_tenant_system_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity_groups (tenant_id, name, is_system)
  VALUES (NEW.id, 'Tutte le sedi', TRUE)
  ON CONFLICT (tenant_id, name) DO NOTHING;

  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- 7-E  invite_tenant_member
-- ---------------------------------------------------------------------------
-- The legacy overload invite_tenant_member(uuid, uuid, text) references
-- v2_tenants and v2_tenant_memberships, and is superseded by the current
-- invite_tenant_member(uuid, text, text) form.  Drop the old overload first,
-- then recreate the current version with updated table names.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.invite_tenant_member(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.invite_tenant_member(
  p_tenant_id uuid,
  p_email     text,
  p_role      text
)
RETURNS TABLE (
  membership_id uuid,
  email         text,
  role          text,
  invite_token  uuid,
  status        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid;
  v_status    text;
  v_token     uuid;
  v_member_id uuid;
BEGIN
  -- Caller must be an active owner or admin of this tenant
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships
    WHERE tenant_id = p_tenant_id
      AND user_id   = auth.uid()
      AND status    = 'active'
      AND role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Normalize email
  p_email := lower(trim(p_email));

  -- Try to resolve email → user_id
  SELECT u.id INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = p_email
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    -- Path A: invitee already has an account
    SELECT tm.status INTO v_status
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = v_user_id;

    IF v_status = 'active'  THEN RAISE EXCEPTION 'user already member'; END IF;
    IF v_status = 'pending' THEN RAISE EXCEPTION 'invite already pending'; END IF;

    -- Guard against stale email-only invite for the same address
    SELECT tm.status INTO v_status
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id            = p_tenant_id
      AND lower(tm.invited_email) = p_email;

    IF v_status = 'pending' THEN RAISE EXCEPTION 'invite already pending'; END IF;

  ELSE
    -- Path B: invitee has no account yet
    SELECT tm.status INTO v_status
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id            = p_tenant_id
      AND lower(tm.invited_email) = p_email;

    IF v_status = 'pending' THEN RAISE EXCEPTION 'invite already pending'; END IF;
  END IF;

  v_token := gen_random_uuid();

  INSERT INTO public.tenant_memberships (
    tenant_id,
    user_id,
    invited_email,
    role,
    status,
    invited_by,
    invite_token
  ) VALUES (
    p_tenant_id,
    v_user_id,
    CASE WHEN v_user_id IS NULL THEN p_email ELSE NULL END,
    p_role,
    'pending',
    auth.uid(),
    v_token
  )
  RETURNING id INTO v_member_id;

  RETURN QUERY SELECT
    v_member_id,
    p_email,
    p_role,
    v_token,
    'pending'::text;
END;
$$;

REVOKE ALL   ON FUNCTION public.invite_tenant_member(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text) TO service_role;


-- ---------------------------------------------------------------------------
-- 7-F  get_invite_info_by_token
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_invite_info_by_token(p_token uuid)
RETURNS TABLE (
  tenant_id   uuid,
  tenant_name text,
  role        text,
  status      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT t.id, t.name, tm.role, tm.status
    FROM public.tenant_memberships tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.invite_token = p_token;
END;
$$;

REVOKE ALL   ON FUNCTION public.get_invite_info_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite_info_by_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite_info_by_token(uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- 7-G  accept_invite_by_token
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_invite_by_token(p_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  UPDATE public.tenant_memberships
  SET
    status       = 'active',
    invite_token = NULL
  WHERE invite_token = p_token
    AND status       = 'pending'
    AND user_id      = auth.uid()
  RETURNING tenant_id INTO v_tenant_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'invalid or already used invite token';
  END IF;

  RETURN v_tenant_id;
END;
$$;

REVOKE ALL   ON FUNCTION public.accept_invite_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invite_by_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite_by_token(uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- 7-H  accept_tenant_invite  (older token-less accept flow, kept for safety)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_tenant_invite(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.tenant_memberships
  SET status = 'active'
  WHERE tenant_id = p_tenant_id
    AND user_id   = auth.uid()
    AND status    = 'pending';

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count = 0 THEN
    RAISE EXCEPTION 'invite not found';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 7-I  remove_tenant_member
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_tenant_member(
  p_tenant_id uuid,
  p_user_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_role   text;
  deleted_count integer;
BEGIN
  -- Caller must be the tenant owner
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants
    WHERE id              = p_tenant_id
      AND owner_user_id   = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT role INTO target_role
  FROM public.tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND user_id   = p_user_id;

  IF target_role IS NULL  THEN RAISE EXCEPTION 'member not found'; END IF;
  IF target_role = 'owner' THEN RAISE EXCEPTION 'cannot remove owner'; END IF;

  DELETE FROM public.tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND user_id   = p_user_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count = 0 THEN
    RAISE EXCEPTION 'member not found';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 7-J  revoke_invite
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_invite(p_membership_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  uuid;
  v_revoked_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_memberships
  WHERE id = p_membership_id;

  IF NOT FOUND THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships
    WHERE tenant_id = v_tenant_id
      AND user_id   = auth.uid()
      AND status    = 'active'
      AND role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  UPDATE public.tenant_memberships
  SET
    status       = 'revoked',
    invite_token = NULL
  WHERE id     = p_membership_id
    AND status = 'pending'
  RETURNING id INTO v_revoked_id;

  RETURN v_revoked_id IS NOT NULL;
END;
$$;


-- ---------------------------------------------------------------------------
-- 7-K  decline_invite_by_token  (current version: sets status = 'declined')
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.decline_invite_by_token(p_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_declined_id uuid;
BEGIN
  UPDATE public.tenant_memberships
  SET
    status       = 'declined',
    invite_token = NULL
  WHERE invite_token = p_token
    AND status       = 'pending'
  RETURNING id INTO v_declined_id;

  RETURN v_declined_id IS NOT NULL;
END;
$$;


-- ---------------------------------------------------------------------------
-- 7-L  change_member_role
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.change_member_role(
  p_tenant_id uuid,
  p_user_id   uuid,
  p_role      text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id uuid;
BEGIN
  IF p_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'invalid role: must be admin or member';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.status    = 'active'
      AND tm.role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  UPDATE public.tenant_memberships
  SET role = p_role
  WHERE tenant_id = p_tenant_id
    AND user_id   = p_user_id
    AND status    = 'active'
    AND role      != 'owner'
  RETURNING id INTO v_updated_id;

  RETURN v_updated_id IS NOT NULL;
END;
$$;


-- ---------------------------------------------------------------------------
-- 7-M  resend_invite
-- ---------------------------------------------------------------------------
-- NOTE: the hardcoded Supabase project URL is intentionally preserved as-is.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resend_invite(p_membership_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id       uuid;
  v_status          text;
  v_email           text;
  v_role            text;
  v_token           uuid;
  v_tenant_name     text;
  v_inviter_email   text;
  v_internal_secret text;
  v_updated_id      uuid;
BEGIN
  SELECT
    tm.tenant_id,
    tm.status,
    COALESCE(u.email, tm.invited_email),
    tm.role
  INTO v_tenant_id, v_status, v_email, v_role
  FROM public.tenant_memberships tm
  LEFT JOIN auth.users u ON u.id = tm.user_id
  WHERE tm.id = p_membership_id;

  IF NOT FOUND THEN RETURN false; END IF;

  IF v_status = 'active' THEN
    RAISE EXCEPTION 'cannot resend invite to an active member';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.status    = 'active'
      AND tm.role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT t.name INTO v_tenant_name
  FROM public.tenants t
  WHERE t.id = v_tenant_id;

  SELECT u.email INTO v_inviter_email
  FROM auth.users u
  WHERE u.id = auth.uid();

  SELECT decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_edge_secret'
  LIMIT 1;

  v_token := gen_random_uuid();

  UPDATE public.tenant_memberships
  SET
    status             = 'pending',
    invite_token       = v_token,
    invite_sent_at     = now(),
    invite_expires_at  = now() + interval '7 days',
    invite_accepted_at = NULL,
    invited_by         = auth.uid()
  WHERE id = p_membership_id
  RETURNING id INTO v_updated_id;

  PERFORM net.http_post(
    url     := 'https://lxeawrpjfphgdspueiag.supabase.co/functions/v1/send-tenant-invite',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'X-Internal-Secret', coalesce(v_internal_secret, '')
    ),
    body    := jsonb_build_object(
      'email',        v_email,
      'tenantName',   coalesce(v_tenant_name, ''),
      'inviterEmail', coalesce(v_inviter_email, ''),
      'inviteToken',  v_token::text
    )
  );

  RETURN v_updated_id IS NOT NULL;
END;
$$;


-- ---------------------------------------------------------------------------
-- 7-N  delete_invite
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_invite(p_membership_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  uuid;
  v_deleted_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_memberships
  WHERE id     = p_membership_id
    AND status IN ('declined', 'revoked', 'expired');

  IF NOT FOUND THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.status    = 'active'
      AND tm.role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  DELETE FROM public.tenant_memberships
  WHERE id     = p_membership_id
    AND status IN ('declined', 'revoked', 'expired')
  RETURNING id INTO v_deleted_id;

  RETURN v_deleted_id IS NOT NULL;
END;
$$;


-- ---------------------------------------------------------------------------
-- 7-O  leave_tenant
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.leave_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants
    WHERE id              = p_tenant_id
      AND owner_user_id   = auth.uid()
  ) INTO v_is_owner;

  IF v_is_owner THEN
    RAISE EXCEPTION 'owner_cannot_leave: the tenant owner cannot leave their own tenant'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenant_memberships
  SET status = 'left'
  WHERE tenant_id = p_tenant_id
    AND user_id   = auth.uid()
    AND status    = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found: no active membership for this user in tenant %', p_tenant_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 7-P  get_public_catalog  (the most complex function — references 12 tables)
-- ---------------------------------------------------------------------------
-- Must come after ALL referenced tables have been renamed AND after
-- is_schedule_active has been recreated with the new parameter type,
-- because this function calls public.is_schedule_active(s) where s is
-- typed as public.schedules.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_catalog(p_catalog_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_catalog         record;
  v_style           record;
  v_active_layout   record;
  v_active_schedule record;
  v_payload         jsonb;
BEGIN
  SELECT *
  INTO v_catalog
  FROM public.catalogs c
  WHERE c.id = p_catalog_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CATALOG_NOT_FOUND');
  END IF;

  -- Pick the best active layout for this catalog
  SELECT sl.*
  INTO v_active_layout
  FROM public.schedule_layout sl
  JOIN public.schedules s ON s.id = sl.schedule_id
  WHERE sl.tenant_id  = v_catalog.tenant_id
    AND s.tenant_id   = v_catalog.tenant_id
    AND public.is_schedule_active(s)
    AND (sl.catalog_id = p_catalog_id OR sl.catalog_id IS NULL)
  ORDER BY
    (sl.catalog_id = p_catalog_id) DESC,
    s.priority DESC,
    s.created_at DESC,
    sl.created_at DESC
  LIMIT 1;

  IF v_active_layout IS NOT NULL THEN
    SELECT s.*
    INTO v_active_schedule
    FROM public.schedules s
    WHERE s.id = v_active_layout.schedule_id;
  ELSE
    v_active_schedule := NULL;
  END IF;

  IF v_active_layout IS NOT NULL THEN
    SELECT st.*
    INTO v_style
    FROM public.styles st
    WHERE st.id = v_active_layout.style_id;
  ELSE
    v_style := NULL;
  END IF;

  v_payload :=
    jsonb_build_object(
      'ok',      true,
      'catalog', to_jsonb(v_catalog),

      'active_schedule', CASE WHEN v_active_schedule IS NULL THEN NULL
                              ELSE to_jsonb(v_active_schedule) END,
      'active_layout',   CASE WHEN v_active_layout   IS NULL THEN NULL
                              ELSE to_jsonb(v_active_layout) END,
      'style',           CASE WHEN v_style IS NULL THEN NULL
                              ELSE to_jsonb(v_style) END,

      'featured_contents', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'featured', to_jsonb(fc),
              'products', COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'link',    to_jsonb(fcp),
                      'product', to_jsonb(p),
                      'options', (
                        SELECT COALESCE(
                          jsonb_agg(
                            jsonb_build_object(
                              'group', jsonb_build_object(
                                'id',             og.id,
                                'name',           og.name,
                                'group_kind',     og.group_kind,
                                'pricing_mode',   og.pricing_mode,
                                'is_required',    og.is_required,
                                'max_selectable', og.max_selectable
                              ),
                              'values', COALESCE(
                                (
                                  SELECT jsonb_agg(
                                    jsonb_build_object(
                                      'id',             ov.id,
                                      'name',           ov.name,
                                      'absolute_price', ov.absolute_price,
                                      'price_modifier', ov.price_modifier
                                    )
                                    ORDER BY ov.created_at
                                  )
                                  FROM public.product_option_values ov
                                  WHERE ov.option_group_id = og.id
                                ),
                                '[]'::jsonb
                              )
                            )
                            ORDER BY og.created_at
                          ),
                          '[]'::jsonb
                        )
                        FROM public.product_option_groups og
                        WHERE og.product_id = p.id
                      )
                    )
                    ORDER BY COALESCE(fcp.sort_order, 0), fcp.created_at
                  )
                  FROM public.featured_content_products fcp
                  JOIN public.products p ON p.id = fcp.product_id
                  WHERE fcp.tenant_id          = v_catalog.tenant_id
                    AND fcp.featured_content_id = fc.id
                ),
                '[]'::jsonb
              )
            )
            ORDER BY fc.created_at
          )
          FROM public.featured_contents fc
          WHERE fc.tenant_id = v_catalog.tenant_id
        ),
        '[]'::jsonb
      ),

      'categories', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'category', to_jsonb(cat),
              'products', COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'link',    to_jsonb(ccp),
                      'product', to_jsonb(p),
                      'options', (
                        SELECT COALESCE(
                          jsonb_agg(
                            jsonb_build_object(
                              'group', jsonb_build_object(
                                'id',             og.id,
                                'name',           og.name,
                                'group_kind',     og.group_kind,
                                'pricing_mode',   og.pricing_mode,
                                'is_required',    og.is_required,
                                'max_selectable', og.max_selectable
                              ),
                              'values', COALESCE(
                                (
                                  SELECT jsonb_agg(
                                    jsonb_build_object(
                                      'id',             ov.id,
                                      'name',           ov.name,
                                      'absolute_price', ov.absolute_price,
                                      'price_modifier', ov.price_modifier
                                    )
                                    ORDER BY ov.created_at
                                  )
                                  FROM public.product_option_values ov
                                  WHERE ov.option_group_id = og.id
                                ),
                                '[]'::jsonb
                              )
                            )
                            ORDER BY og.created_at
                          ),
                          '[]'::jsonb
                        )
                        FROM public.product_option_groups og
                        WHERE og.product_id = p.id
                      ),
                      'pricing', (
                        WITH o AS (
                          SELECT spo.override_price, spo.show_original_price
                          FROM public.schedule_price_overrides spo
                          JOIN public.schedules s ON s.id = spo.schedule_id
                          WHERE spo.tenant_id  = v_catalog.tenant_id
                            AND spo.product_id = p.id
                            AND s.enabled      = true
                          ORDER BY spo.created_at DESC
                          LIMIT 1
                        ),
                        fp AS (
                          SELECT MIN(ov.absolute_price) AS min_price
                          FROM public.product_option_groups og
                          JOIN public.product_option_values ov ON ov.option_group_id = og.id
                          WHERE og.product_id   = p.id
                            AND og.group_kind   = 'PRIMARY_PRICE'
                            AND og.pricing_mode = 'ABSOLUTE'
                            AND ov.absolute_price IS NOT NULL
                        )
                        SELECT jsonb_build_object(
                          'base_price',          p.base_price,
                          'effective_price',     COALESCE((SELECT override_price FROM o), p.base_price),
                          'has_override',        ((SELECT override_price FROM o) IS NOT NULL),
                          'show_original_price', COALESCE((SELECT show_original_price FROM o), false),
                          'original_price',
                            CASE
                              WHEN (SELECT override_price FROM o) IS NOT NULL
                                AND COALESCE((SELECT show_original_price FROM o), false)
                              THEN p.base_price
                              ELSE NULL
                            END,
                          'from_price', (SELECT min_price FROM fp)
                        )
                      )
                    )
                    ORDER BY COALESCE(ccp.sort_order, 0), ccp.created_at
                  )
                  FROM public.catalog_category_products ccp
                  JOIN public.products p ON p.id = ccp.product_id
                  WHERE ccp.catalog_id  = p_catalog_id
                    AND ccp.category_id = cat.id
                ),
                '[]'::jsonb
              )
            )
            ORDER BY COALESCE(cat.sort_order, 0), cat.created_at
          )
          FROM public.catalog_categories cat
          WHERE cat.catalog_id         = p_catalog_id
            AND cat.parent_category_id IS NULL
        ),
        '[]'::jsonb
      )
    );

  RETURN v_payload;
END;
$$;


-- =============================================================================
-- STEP 8  Recreate views with new names and clean body text
-- =============================================================================
-- Both views were dropped in Step 2.  Created here with updated table
-- references so that pg_views.definition shows the correct names.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 8-A  tenant_members_view  (was v2_tenant_members_view)
-- ---------------------------------------------------------------------------
-- Final shape from 20260313160000: includes membership_id, invite_token,
-- invite_expires_at, and the inviter's email.
-- ---------------------------------------------------------------------------

CREATE VIEW public.tenant_members_view AS
SELECT
  tm.id                               AS membership_id,
  tm.tenant_id,
  tm.user_id,
  COALESCE(u.email, tm.invited_email) AS email,
  tm.role,
  tm.status,
  tm.invited_by,
  inviter.email                       AS inviter_email,
  tm.invite_token,
  tm.invite_expires_at,
  tm.created_at
FROM public.tenant_memberships tm
LEFT JOIN auth.users u       ON u.id       = tm.user_id
LEFT JOIN auth.users inviter ON inviter.id = tm.invited_by;


-- ---------------------------------------------------------------------------
-- 8-B  user_tenants_view  (was v2_user_tenants_view)
-- ---------------------------------------------------------------------------
-- Final shape from 20260314170000: filters soft-deleted tenants.
-- ---------------------------------------------------------------------------

CREATE VIEW public.user_tenants_view AS
SELECT
  t.id,
  t.name,
  t.vertical_type,
  t.created_at,
  t.owner_user_id,
  CASE
    WHEN t.owner_user_id = auth.uid() THEN 'owner'
    ELSE tm.role
  END AS user_role
FROM public.tenants t
LEFT JOIN public.tenant_memberships tm
  ON  tm.tenant_id = t.id
  AND tm.user_id   = auth.uid()
  AND tm.status    = 'active'
WHERE t.deleted_at IS NULL;


COMMIT;
