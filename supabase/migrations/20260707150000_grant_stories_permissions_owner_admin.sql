-- The owner/admin "get every permission" INSERT in 20260526170000 was a
-- one-time snapshot (SELECT id FROM permissions AT THAT TIME) — it ran
-- before stories.read/stories.write existed, so owner/admin never got them.
-- 20260707125900 correctly seeded manager/staff/viewer but wrongly assumed
-- owner/admin pick up new permissions automatically. They don't: explicit
-- rows needed, mirroring the same 2 roles/permissions featured.* has.

INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('owner', 'stories.read'),
  ('owner', 'stories.write'),
  ('admin', 'stories.read'),
  ('admin', 'stories.write');
