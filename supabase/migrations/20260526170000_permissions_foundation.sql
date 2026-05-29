-- =============================================================================
-- Permissions multi-sede — Fase 1: DB Foundation
--
-- Additive, silent migration. After apply the system behaves exactly as
-- before: no RLS policy is modified, no existing RPC is modified, no edge
-- function is touched. This migration only creates the schema and helpers
-- that future phases (RPC layer, RLS rewrite, frontend) will consume.
--
-- See docs/permissions-audit.md for the full audit and decisions.
--
-- Steps:
--   1. Relax NOT NULL on tenant_memberships.role
--   2. Cleanup legacy tenant_memberships.role = 'member' → NULL
--   3. Add CHECK constraint on tenant_memberships.role
--   4. Create public.permissions table + RLS
--   5. Create public.role_permissions table + RLS
--   6. Create public.tenant_membership_activities table + RLS
--   7. Create helper get_my_activity_ids()
--   8. Create helper has_permission(text, uuid)
--   9. Seed permissions (35 atomic permissions)
--  10. Seed role_permissions (mapping owner/admin/manager/staff/viewer)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Step 1 — Relax NOT NULL constraint on tenant_memberships.role.
-- Required for Strada A: rows representing activity-scoped roles
-- (manager/staff/viewer) keep role = NULL in tenant_memberships, with the
-- real role stored per-activity in tenant_membership_activities.
-- Without this, both the legacy `member` cleanup (Step 2) and future
-- invites of activity-scoped members would fail.
-- -----------------------------------------------------------------------------

ALTER TABLE public.tenant_memberships
  ALTER COLUMN role DROP NOT NULL;

-- -----------------------------------------------------------------------------
-- Step 2 — Cleanup legacy `member` role values.
-- Audit §1.1: staging has 3 legacy `member` rows (all expired/revoked).
-- Marking them NULL is forward-compatible with the new model where
-- activity-scoped roles live in tenant_membership_activities and the parent
-- row keeps role = NULL.
-- -----------------------------------------------------------------------------

UPDATE public.tenant_memberships
SET role = NULL
WHERE role = 'member';

-- -----------------------------------------------------------------------------
-- Step 3 — CHECK constraint: role must be NULL, 'owner', or 'admin'.
-- NOTE: existing RPC `invite_tenant_member` still accepts p_role = 'member'.
-- Calls with that value will fail this CHECK after the migration applies.
-- The RPC will be updated in Fase 3. No active member exists today.
-- -----------------------------------------------------------------------------

ALTER TABLE public.tenant_memberships
  ADD CONSTRAINT tenant_memberships_role_check
  CHECK (role IS NULL OR role IN ('owner', 'admin'));

-- -----------------------------------------------------------------------------
-- Step 4 — `permissions` catalog table.
-- Atomic permission registry. Read-only for authenticated; writes via
-- service_role / migration only.
-- -----------------------------------------------------------------------------

CREATE TABLE public.permissions (
  id          text        PRIMARY KEY,
  description text        NOT NULL,
  scope       text        NOT NULL CHECK (scope IN ('tenant', 'activity')),
  category    text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.permissions IS
  'Catalogo permessi atomici. Seeded con i permessi definiti '
  'nell''epic permessi multi-sede. Schema preparato per futuri '
  'custom roles (vedi docs/permissions-audit.md).';
COMMENT ON COLUMN public.permissions.id          IS 'Permission id in the form <domain>.<verb>, e.g. orders.read.';
COMMENT ON COLUMN public.permissions.scope       IS 'tenant = check is tenant-wide; activity = requires activity_id.';
COMMENT ON COLUMN public.permissions.category    IS 'Logical grouping for future admin UI (tenant, billing, team, ...).';

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read permissions"
  ON public.permissions
  FOR SELECT TO authenticated
  USING (true);

-- -----------------------------------------------------------------------------
-- Step 5 — `role_permissions` mapping table.
-- Role → permission mapping for the 5 predefined roles. Modifying the
-- mapping = INSERT/DELETE here, no code deploy required.
-- -----------------------------------------------------------------------------

CREATE TABLE public.role_permissions (
  role          text        NOT NULL,
  permission_id text        NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission_id),
  CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'viewer'))
);

CREATE INDEX role_permissions_permission_id_idx
  ON public.role_permissions(permission_id);

COMMENT ON TABLE public.role_permissions IS
  'Mapping ruolo → permessi. I 5 ruoli predefiniti sono seeded. '
  'Modifiche al mapping = INSERT/DELETE su questa tabella, nessun '
  'deploy di codice richiesto.';

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read role_permissions"
  ON public.role_permissions
  FOR SELECT TO authenticated
  USING (true);

-- -----------------------------------------------------------------------------
-- Step 6 — `tenant_membership_activities` assignment table.
-- Pivot between a tenant_memberships row and a specific activity, with
-- the activity-scoped role (manager/staff/viewer). tenant_id is
-- denormalized for RLS quick filter.
-- -----------------------------------------------------------------------------

CREATE TABLE public.tenant_membership_activities (
  tenant_membership_id uuid        NOT NULL REFERENCES public.tenant_memberships(id) ON DELETE CASCADE,
  activity_id          uuid        NOT NULL REFERENCES public.activities(id)         ON DELETE CASCADE,
  tenant_id            uuid        NOT NULL REFERENCES public.tenants(id)            ON DELETE CASCADE,
  role                 text        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_membership_id, activity_id),
  CHECK (role IN ('manager', 'staff', 'viewer'))
);

CREATE INDEX tenant_membership_activities_tenant_membership_id_idx
  ON public.tenant_membership_activities(tenant_membership_id);

CREATE INDEX tenant_membership_activities_activity_id_idx
  ON public.tenant_membership_activities(activity_id);

CREATE INDEX tenant_membership_activities_tenant_id_idx
  ON public.tenant_membership_activities(tenant_id);

COMMENT ON TABLE public.tenant_membership_activities IS
  'Assegnazione di un membership a una sede specifica con ruolo '
  'activity-scoped. Solo per ruoli manager/staff/viewer. '
  'tenant_id è denormalizzato per RLS quick filter.';

ALTER TABLE public.tenant_membership_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read own assignments"
  ON public.tenant_membership_activities
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "No direct writes"
  ON public.tenant_membership_activities
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- -----------------------------------------------------------------------------
-- Step 7 — Helper get_my_activity_ids().
-- Mirror of get_my_tenant_ids() but at the activity granularity.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_activity_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  -- Branch A: owner/admin of tenant → all activities of that tenant.
  SELECT a.id
  FROM public.activities a
  WHERE a.tenant_id IN (
    SELECT t.id
    FROM public.tenants t
    WHERE t.owner_user_id = auth.uid()
      AND t.deleted_at IS NULL
    UNION
    SELECT tm.tenant_id
    FROM public.tenant_memberships tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.user_id = auth.uid()
      AND tm.status  = 'active'
      AND tm.role    IN ('owner', 'admin')
      AND t.deleted_at IS NULL
  )

  UNION

  -- Branch B: activity-scoped roles → only assigned activities.
  SELECT tma.activity_id
  FROM public.tenant_membership_activities tma
  JOIN public.tenant_memberships tm ON tm.id = tma.tenant_membership_id
  WHERE tm.user_id = auth.uid()
    AND tm.status  = 'active'
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_activity_ids() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_activity_ids() TO authenticated;

COMMENT ON FUNCTION public.get_my_activity_ids() IS
  'Ritorna activity_id visibili all''utente corrente. '
  'owner/admin → tutte le activities dei loro tenant. '
  'manager/staff/viewer → solo le activities assegnate via '
  'tenant_membership_activities.';

-- -----------------------------------------------------------------------------
-- Step 8 — Helper has_permission(p_permission_id, p_activity_id).
-- Returns true if the current user holds the permission.
--   - For tenant-scoped permissions: p_activity_id is ignored, matched via
--     owner OR active admin membership.
--   - For activity-scoped permissions: owner/admin still match unconditionally
--     (they hold every permission for every activity); manager/staff/viewer
--     match only on the specific p_activity_id assignment.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_permission(
  p_permission_id text,
  p_activity_id   uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH
  permission_info AS (
    SELECT scope FROM public.permissions WHERE id = p_permission_id
  ),
  -- Tenant-scoped role match: caller is owner/admin and the role holds
  -- the permission in role_permissions. Activity_id is irrelevant here.
  tenant_role_match AS (
    SELECT 1
    FROM permission_info pi
    WHERE EXISTS (
      SELECT 1
      FROM public.tenants t
      WHERE t.owner_user_id = auth.uid()
        AND t.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM public.role_permissions rp
          WHERE rp.role = 'owner' AND rp.permission_id = p_permission_id
        )

      UNION

      SELECT 1
      FROM public.tenant_memberships tm
      JOIN public.tenants t ON t.id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
        AND tm.status  = 'active'
        AND tm.role    = 'admin'
        AND t.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM public.role_permissions rp
          WHERE rp.role = 'admin' AND rp.permission_id = p_permission_id
        )
    )
  ),
  -- Activity-scoped role match: caller has an assignment whose role
  -- holds the permission, restricted to the supplied activity.
  activity_role_match AS (
    SELECT 1
    FROM permission_info pi
    WHERE pi.scope = 'activity'
      AND p_activity_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.tenant_membership_activities tma
        JOIN public.tenant_memberships tm ON tm.id   = tma.tenant_membership_id
        JOIN public.role_permissions     rp ON rp.role = tma.role
        WHERE tm.user_id      = auth.uid()
          AND tm.status       = 'active'
          AND tma.activity_id = p_activity_id
          AND rp.permission_id = p_permission_id
      )
  )
  SELECT EXISTS (SELECT 1 FROM tenant_role_match)
      OR EXISTS (SELECT 1 FROM activity_role_match);
$$;

REVOKE EXECUTE ON FUNCTION public.has_permission(text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.has_permission(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.has_permission(text, uuid) IS
  'Verifica se l''utente corrente ha un permesso atomico. '
  'Per permessi tenant-scoped p_activity_id può essere NULL. '
  'Per permessi activity-scoped p_activity_id è obbligatorio.';

-- -----------------------------------------------------------------------------
-- Step 9 — Seed permissions (35 atomic permissions).
-- -----------------------------------------------------------------------------

INSERT INTO public.permissions (id, scope, category, description) VALUES
  ('tenant.read',               'tenant',   'tenant',     'Vedere il tenant'),
  ('tenant.manage',             'tenant',   'tenant',     'Modificare info tenant'),
  ('tenant.delete',             'tenant',   'tenant',     'Eliminare tenant (irreversibile)'),
  ('tenant.transfer_ownership', 'tenant',   'tenant',     'Trasferire proprietà tenant'),

  ('billing.read',              'tenant',   'billing',    'Vedere info abbonamento'),
  ('billing.manage',            'tenant',   'billing',    'Gestire abbonamento (upgrade, seats)'),
  ('billing.cancel',            'tenant',   'billing',    'Cancellare abbonamento'),

  ('team.read',                 'tenant',   'team',       'Vedere membri del team'),
  ('team.invite',               'tenant',   'team',       'Invitare nuovi membri'),
  ('team.manage_roles',         'tenant',   'team',       'Modificare ruoli di altri membri'),
  ('team.remove',               'tenant',   'team',       'Rimuovere membri dal tenant'),

  ('activities.create',         'tenant',   'activities', 'Creare nuova sede'),
  ('activities.delete',         'tenant',   'activities', 'Eliminare sede'),
  ('activity.read',             'activity', 'activities', 'Vedere info della sede'),
  ('activity.manage',           'activity', 'activities', 'Modificare info sede'),
  ('activity_hours.write',      'activity', 'activities', 'Modificare orari/chiusure sede'),

  ('products.read',             'tenant',   'content',    'Vedere catalogo prodotti tenant'),
  ('products.write',            'tenant',   'content',    'Modificare prodotti tenant'),
  ('catalogs.read',             'tenant',   'content',    'Vedere cataloghi tenant'),
  ('catalogs.write',            'tenant',   'content',    'Modificare cataloghi tenant'),
  ('styles.read',               'tenant',   'content',    'Vedere stili tenant'),
  ('styles.write',              'tenant',   'content',    'Modificare stili tenant'),
  ('attributes.write',          'tenant',   'content',    'Modificare attributi prodotto'),

  ('scheduling.read',           'activity', 'scheduling', 'Vedere regole scheduling che toccano sede'),
  ('scheduling.write',          'activity', 'scheduling', 'Modificare regole scheduling sede'),

  ('featured.read',             'activity', 'content',    'Vedere contenuti in evidenza della sede'),
  ('featured.write',            'activity', 'content',    'Modificare contenuti in evidenza della sede'),

  ('orders.read',               'activity', 'operations', 'Vedere ordini della sede'),
  ('orders.manage',             'activity', 'operations', 'Gestire stato ordini della sede'),
  ('tables.read',               'activity', 'operations', 'Vedere tavoli della sede'),
  ('tables.manage',             'activity', 'operations', 'Gestire tavoli della sede'),
  ('reviews.read',              'activity', 'operations', 'Vedere recensioni della sede'),
  ('reviews.respond',           'activity', 'operations', 'Rispondere a recensioni della sede'),
  ('notifications.receive',     'activity', 'operations', 'Ricevere notifiche operative della sede'),

  ('analytics.read',            'activity', 'insights',   'Vedere analytics della sede');

-- -----------------------------------------------------------------------------
-- Step 10 — Seed role_permissions.
-- Matrix authoritativa: docs/permissions-audit.md prompt originale.
-- -----------------------------------------------------------------------------

-- owner — all 35 permissions
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'owner', id FROM public.permissions;

-- admin — all permissions except tenant.delete, tenant.transfer_ownership, billing.cancel
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin', id
FROM public.permissions
WHERE id NOT IN ('tenant.delete', 'tenant.transfer_ownership', 'billing.cancel');

-- manager — 23 permissions
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('manager', 'tenant.read'),
  ('manager', 'team.read'),
  ('manager', 'team.invite'),
  ('manager', 'team.manage_roles'),
  ('manager', 'team.remove'),
  ('manager', 'activity.read'),
  ('manager', 'activity.manage'),
  ('manager', 'activity_hours.write'),
  ('manager', 'products.read'),
  ('manager', 'catalogs.read'),
  ('manager', 'styles.read'),
  ('manager', 'scheduling.read'),
  ('manager', 'scheduling.write'),
  ('manager', 'featured.read'),
  ('manager', 'featured.write'),
  ('manager', 'orders.read'),
  ('manager', 'orders.manage'),
  ('manager', 'tables.read'),
  ('manager', 'tables.manage'),
  ('manager', 'reviews.read'),
  ('manager', 'reviews.respond'),
  ('manager', 'analytics.read'),
  ('manager', 'notifications.receive');

-- staff — 13 permissions
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('staff', 'tenant.read'),
  ('staff', 'activity.read'),
  ('staff', 'products.read'),
  ('staff', 'catalogs.read'),
  ('staff', 'styles.read'),
  ('staff', 'featured.read'),
  ('staff', 'orders.read'),
  ('staff', 'orders.manage'),
  ('staff', 'tables.read'),
  ('staff', 'tables.manage'),
  ('staff', 'reviews.read'),
  ('staff', 'reviews.respond'),
  ('staff', 'notifications.receive');

-- viewer — 11 permissions
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('viewer', 'tenant.read'),
  ('viewer', 'activity.read'),
  ('viewer', 'products.read'),
  ('viewer', 'catalogs.read'),
  ('viewer', 'styles.read'),
  ('viewer', 'scheduling.read'),
  ('viewer', 'featured.read'),
  ('viewer', 'orders.read'),
  ('viewer', 'tables.read'),
  ('viewer', 'reviews.read'),
  ('viewer', 'analytics.read');

COMMIT;
