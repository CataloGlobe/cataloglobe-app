-- =========================================
-- ORDERS EPIC — Phase 1.9: RPC resolve_table_by_token
-- =========================================
-- Public lookup: maps a QR `qr_token` (uuid) to the minimum amount of
-- table + activity metadata the guest's phone needs in order to render
-- the entry screen and, subsequently, to call the `resolve-table` Edge
-- Function that will create / refresh the customer_session.
--
-- Why SECURITY DEFINER:
--   `public.tables` has tenant-scoped RLS that intentionally has no
--   policy `TO anon`. A guest scanning a QR code is `anon` and therefore
--   cannot SELECT from `public.tables` directly. This RPC bypasses RLS
--   in a tightly controlled way: a single row, identified by an
--   already-secret UUID token, exposing only the fields needed for the
--   public flow.
--
-- Security guarantees baked into the function body:
--   - Single mandatory parameter (`p_token uuid`); no wildcards, no
--     pattern-matching, no listing of "all my tables".
--   - Filters `t.qr_token = p_token` against a UNIQUE column, so at
--     most one row is ever returned.
--   - `t.deleted_at IS NULL`: soft-deleted tables are invisible to the
--     public, even with a previously valid token.
--   - `a.status = 'active'`: a deactivated activity is unreachable.
--     (Live data only contains 'active', and CLAUDE.md documents the
--     enum as 'active' | 'inactive'.)
--   - Return columns are restricted to a deliberately narrow set; no
--     timestamps, no `seats`, no audit metadata.
--
-- Hardening pattern (mandated by CLAUDE.md for SECURITY DEFINER):
--   - STABLE: read-only lookup.
--   - SET search_path TO '': prevents search_path hijacking.
--   - All identifiers fully qualified (`public.tables`, `public.activities`).
--   - REVOKE EXECUTE FROM PUBLIC, then GRANT to the explicit roles only.
--
-- Callable roles:
--   - `anon`          → the guest's phone immediately after a QR scan.
--   - `authenticated` → admin in-app preview of the guest entry flow.

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_table_by_token(p_token uuid)
RETURNS TABLE (
  table_id          uuid,
  tenant_id         uuid,
  activity_id       uuid,
  activity_slug     text,
  label             text,
  zone              text,
  maintenance_mode  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    t.id               AS table_id,
    t.tenant_id        AS tenant_id,
    t.activity_id      AS activity_id,
    a.slug             AS activity_slug,
    t.label            AS label,
    t.zone             AS zone,
    t.maintenance_mode AS maintenance_mode
  FROM public.tables t
  JOIN public.activities a ON a.id = t.activity_id
  WHERE t.qr_token = p_token
    AND t.deleted_at IS NULL
    AND a.status = 'active';
$$;

-- Strip the implicit PUBLIC grant before handing access to specific roles.
REVOKE EXECUTE ON FUNCTION public.resolve_table_by_token(uuid) FROM PUBLIC;

-- Explicit grants for the only two roles that should ever call this RPC.
GRANT EXECUTE ON FUNCTION public.resolve_table_by_token(uuid) TO anon, authenticated;

COMMIT;
