-- =========================================
-- ORDERS EPIC — Phase 1.1: tables (dining tables)
-- =========================================
-- Creates the `tables` entity (one row per physical dining table under an activity).
-- Public QR resolution uses `qr_token` (uuid) via a SECURITY DEFINER RPC
-- created in a later task.
--
-- Notes:
--   - No `status` column: "free/occupied" state is derived via the view
--     `v_tables_with_state` introduced in a later task (depends on
--     customer_sessions / orders not yet created).
--   - Soft-delete via `deleted_at`; hard DELETE is never performed.
--   - `maintenance_mode` is the manual disable flag.
--   - Trigger reuses the existing `public.set_updated_at()` helper.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  label text NOT NULL,
  qr_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  seats smallint CHECK (seats > 0),
  zone text,
  maintenance_mode boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Partial unique: same label allowed only across deleted rows.
CREATE UNIQUE INDEX IF NOT EXISTS tables_activity_label_unique
  ON public.tables (activity_id, label)
  WHERE deleted_at IS NULL;

-- Tenant + activity lookup (list view).
CREATE INDEX IF NOT EXISTS idx_tables_tenant_activity
  ON public.tables (tenant_id, activity_id)
  WHERE deleted_at IS NULL;

-- QR token lookup (public resolve).
CREATE INDEX IF NOT EXISTS idx_tables_qr_token
  ON public.tables (qr_token)
  WHERE deleted_at IS NULL;

-- Zone grouping inside an activity.
CREATE INDEX IF NOT EXISTS idx_tables_zone
  ON public.tables (activity_id, zone)
  WHERE deleted_at IS NULL;

-- Keep updated_at in sync (reuses existing helper).
DROP TRIGGER IF EXISTS tables_set_updated_at ON public.tables;
CREATE TRIGGER tables_set_updated_at
  BEFORE UPDATE ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- RLS
-- =========================================
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON public.tables;
CREATE POLICY "Tenant select own rows"
ON public.tables
FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant insert own rows" ON public.tables;
CREATE POLICY "Tenant insert own rows"
ON public.tables
FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant update own rows" ON public.tables;
CREATE POLICY "Tenant update own rows"
ON public.tables
FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()))
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant delete own rows" ON public.tables;
CREATE POLICY "Tenant delete own rows"
ON public.tables
FOR DELETE
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

COMMIT;
