-- =========================================
-- ORDERS EPIC — Phase 1.7: anon RLS policies (custom JWT)
-- =========================================
-- Adds the guest-side ("anon") RLS policies to the three tables that the
-- customer's phone must read directly via Supabase Realtime + PostgREST:
--   - public.customer_sessions  (SELECT + UPDATE)
--   - public.orders             (SELECT)
--   - public.order_items        (SELECT)
--
-- Custom JWT pattern (recap — full spec in docs/orders-architecture.md §5.2):
--   1. Edge Function `resolve-table` (Phase 2) signs a JWT with
--      `SUPABASE_JWT_SECRET`, embedding:
--        - standard claims: sub, iss, iat, exp, aud="authenticated"
--        - `role: "anon"`        ← critical: tells PostgREST to switch the
--                                  Postgres session to the `anon` role,
--                                  activating these `TO anon` policies.
--        - `customer_session_id` ← custom claim, uuid of the guest session.
--   2. The web client passes that JWT to supabase-js as `accessToken`.
--   3. PostgREST validates signature + expiry, sets the session role to
--      `anon`, and exposes all claims via
--      `current_setting('request.jwt.claims', true)`.
--   4. The helper `public.get_jwt_customer_session_id()` (created in
--      migration 20260519130000) extracts the claim as uuid.
--
-- Performance — `(SELECT public.get_jwt_customer_session_id())` wrap:
--   PostgreSQL evaluates STABLE functions once per row inside an RLS
--   predicate unless they are wrapped in a scalar subquery, which lets the
--   planner cache the value as an initPlan (one evaluation per query).
--   Per Supabase RLS performance guidance, every reference to the helper
--   in a policy below uses the `(SELECT ...)` wrap.
--
-- Scope of this migration:
--   - Only adds the anon policies listed above. The existing tenant-scoped
--     `TO authenticated` policies on every table are left untouched.
--   - NO anon INSERT/UPDATE/DELETE on `orders` or `order_items` — all
--     guest-driven mutations go through Edge Functions (`submit-order`,
--     `cancel-order`) running with the service_role key.
--   - NO anon policies on `tables`, `order_groups`,
--     `product_availability_overrides` — by design (see §5.2 "Tabelle
--     SENZA policy anon"); those tables are read via SECURITY DEFINER
--     RPCs or are admin-only.

BEGIN;

-- =========================================
-- customer_sessions — anon SELECT
-- =========================================
-- Guest reads only their own session row.
DROP POLICY IF EXISTS "Customer select own session" ON public.customer_sessions;
CREATE POLICY "Customer select own session"
ON public.customer_sessions
FOR SELECT
TO anon
USING (id = (SELECT public.get_jwt_customer_session_id()));

-- =========================================
-- customer_sessions — anon UPDATE
-- =========================================
-- Guest may update non-sensitive fields on their own session row
-- (typically `customer_name`). The Edge Function `resolve-table`
-- continues to own the lifecycle fields (`current_table_id`,
-- `expires_at`, `last_activity_at`) via service_role.
DROP POLICY IF EXISTS "Customer update own session" ON public.customer_sessions;
CREATE POLICY "Customer update own session"
ON public.customer_sessions
FOR UPDATE
TO anon
USING (id = (SELECT public.get_jwt_customer_session_id()))
WITH CHECK (id = (SELECT public.get_jwt_customer_session_id()));

-- =========================================
-- customer_sessions — column-level UPDATE grants for anon
-- =========================================
-- The UPDATE policy above is per-row (matches by id). To prevent guests from
-- touching lifecycle columns (expires_at, current_table_id, order_group_id,
-- last_activity_at, …) via a crafted supabase-js call, we revoke the broad
-- UPDATE privilege from `anon` and re-grant it only on `customer_name`.
-- This way `update({expires_at: ...})` fails with permission denied at the
-- column-privilege layer BEFORE RLS is even evaluated; only
-- `update({customer_name: ...})` proceeds and is then row-filtered by the
-- policy above.
REVOKE UPDATE ON public.customer_sessions FROM anon;
GRANT UPDATE (customer_name) ON public.customer_sessions TO anon;

-- =========================================
-- orders — anon SELECT
-- =========================================
-- Guest reads only orders attached to their own session. Mutations
-- (submit / cancel) are handled by Edge Functions with service_role,
-- so no INSERT/UPDATE/DELETE policy is granted to anon here.
DROP POLICY IF EXISTS "Customer select own orders" ON public.orders;
CREATE POLICY "Customer select own orders"
ON public.orders
FOR SELECT
TO anon
USING (customer_session_id = (SELECT public.get_jwt_customer_session_id()));

-- =========================================
-- order_items — anon SELECT
-- =========================================
-- order_items has no direct `customer_session_id`; tenancy / ownership
-- is resolved via JOIN on `orders`.
DROP POLICY IF EXISTS "Customer select own order items" ON public.order_items;
CREATE POLICY "Customer select own order items"
ON public.order_items
FOR SELECT
TO anon
USING (order_id IN (
  SELECT id FROM public.orders
  WHERE customer_session_id = (SELECT public.get_jwt_customer_session_id())
));

COMMIT;
