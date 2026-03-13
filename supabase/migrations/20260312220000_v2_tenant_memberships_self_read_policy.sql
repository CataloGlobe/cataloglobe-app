BEGIN;

-- =========================================
-- V2: TENANT MEMBERSHIPS — SELF-READ POLICY
-- =========================================
--
-- Migration 20260312123000 fixed RLS recursion by restricting SELECT
-- to owners only, which broke the LEFT JOIN in v2_user_tenants_view:
-- members could not read their own membership row, so tm.role = NULL.
--
-- Fix: add a second SELECT policy allowing each user to read their
-- own row. Non-recursive: no subquery, no self-join.
-- The existing owner policy is untouched.
-- =========================================

CREATE POLICY "Users can read their own membership"
ON public.v2_tenant_memberships
FOR SELECT TO authenticated
USING (user_id = auth.uid());

COMMIT;
