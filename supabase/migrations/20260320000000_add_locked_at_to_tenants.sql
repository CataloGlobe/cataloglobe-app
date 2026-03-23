BEGIN;

-- =============================================================================
-- Add tenants.locked_at
-- =============================================================================
--
-- Marks a tenant as locked when the owner deletes their account without
-- transferring ownership. Locked tenants are inaccessible to all members
-- until either the owner recovers their account (locked_at = NULL) or
-- 30 days elapse and the tenant is purged.
--
-- Separate from deleted_at, which covers the explicit "delete this tenant"
-- flow. The two columns are independent.
-- =============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS locked_at timestamptz NULL;

-- Sparse index: only rows where locked_at is set are indexed.
-- Used by the purge cron job and by get_my_tenant_ids() future updates.
CREATE INDEX IF NOT EXISTS idx_tenants_locked_at_not_null
  ON public.tenants (locked_at)
  WHERE locked_at IS NOT NULL;

COMMIT;
