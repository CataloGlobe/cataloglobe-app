-- Add translations.write permission (tenant-scoped, category 'content').
-- Matches the existing proxy via catalogs.read in the sidebar;
-- enables fine-grained gating of the /languages page (Track A5 FE).

BEGIN;

INSERT INTO public.permissions (id, scope, category, description) VALUES
  ('translations.write', 'tenant', 'content', 'Modificare traduzioni prodotti tenant');

INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('owner', 'translations.write'),
  ('admin', 'translations.write');

COMMIT;
