-- =========================================
-- RESERVATIONS — Foundation schema
-- =========================================
-- Per-activity table reservations. Customer-facing booking form posts here;
-- venue admin manages lifecycle (pending → confirmed/declined/cancelled).
--
-- Activity-scoped RLS: access via has_permission('reservations.read|manage',
-- activity_id), so per-site team members are isolated correctly.
-- tenant_id is kept for FK + cross-site analytics inside the same tenant.
--
-- Times are wall-clock local (date + time WITHOUT TIME ZONE) — venues book
-- in their own local hours; no timezone arithmetic is needed at the DB layer.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id)    ON DELETE CASCADE,
  activity_id      uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  reservation_date date NOT NULL,
  reservation_time time NOT NULL,
  party_size       int  NOT NULL CHECK (party_size > 0),
  customer_name    text NOT NULL,
  customer_email   text NOT NULL,
  customer_phone   text NOT NULL,
  notes            text,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','confirmed','declined','cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reservations_tenant
  ON public.reservations (tenant_id);

CREATE INDEX IF NOT EXISTS idx_reservations_activity_date
  ON public.reservations (activity_id, reservation_date);

-- -----------------------------------------------------------------------------
-- 3. updated_at trigger (reuses existing helper)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS reservations_set_updated_at
  ON public.reservations;
CREATE TRIGGER reservations_set_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Activities flag — opt-in per venue
-- -----------------------------------------------------------------------------
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS enable_reservations boolean NOT NULL DEFAULT false;

-- -----------------------------------------------------------------------------
-- 5. Seed permissions (activity-scoped, operations category)
-- -----------------------------------------------------------------------------
INSERT INTO public.permissions (id, scope, category, description) VALUES
  ('reservations.read',   'activity', 'operations', 'Vedere prenotazioni della sede'),
  ('reservations.manage', 'activity', 'operations', 'Gestire prenotazioni della sede')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. Map permissions to roles — mirrors orders.read / orders.manage 1:1
-- -----------------------------------------------------------------------------
-- owner: read + manage
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('owner', 'reservations.read'),
  ('owner', 'reservations.manage')
ON CONFLICT (role, permission_id) DO NOTHING;

-- admin: read + manage
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('admin', 'reservations.read'),
  ('admin', 'reservations.manage')
ON CONFLICT (role, permission_id) DO NOTHING;

-- manager: read + manage
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('manager', 'reservations.read'),
  ('manager', 'reservations.manage')
ON CONFLICT (role, permission_id) DO NOTHING;

-- staff: read + manage
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('staff', 'reservations.read'),
  ('staff', 'reservations.manage')
ON CONFLICT (role, permission_id) DO NOTHING;

-- viewer: read only (mirrors orders viewer mapping)
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('viewer', 'reservations.read')
ON CONFLICT (role, permission_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. RLS — activity-scoped via has_permission(permission_id, activity_id)
-- -----------------------------------------------------------------------------
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Roles can read reservations" ON public.reservations;
CREATE POLICY "Roles can read reservations"
  ON public.reservations FOR SELECT TO authenticated
  USING (public.has_permission('reservations.read', activity_id));

DROP POLICY IF EXISTS "Roles can insert reservations" ON public.reservations;
CREATE POLICY "Roles can insert reservations"
  ON public.reservations FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('reservations.manage', activity_id));

DROP POLICY IF EXISTS "Roles can update reservations" ON public.reservations;
CREATE POLICY "Roles can update reservations"
  ON public.reservations FOR UPDATE TO authenticated
  USING       (public.has_permission('reservations.manage', activity_id))
  WITH CHECK  (public.has_permission('reservations.manage', activity_id));

DROP POLICY IF EXISTS "Roles can delete reservations" ON public.reservations;
CREATE POLICY "Roles can delete reservations"
  ON public.reservations FOR DELETE TO authenticated
  USING (public.has_permission('reservations.manage', activity_id));

COMMIT;
