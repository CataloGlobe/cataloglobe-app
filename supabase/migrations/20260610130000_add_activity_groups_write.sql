-- Add activity_groups.write permission (tenant-scoped, category 'activities').
-- Gates the groups tab in /locations (Track A5).

BEGIN;

INSERT INTO public.permissions (id, scope, category, description) VALUES
  ('activity_groups.write', 'tenant', 'activities', 'Creare e gestire gruppi di sedi')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('owner', 'activity_groups.write'),
  ('admin', 'activity_groups.write')
ON CONFLICT DO NOTHING;

COMMIT;
