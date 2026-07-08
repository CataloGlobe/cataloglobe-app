-- Stories permission seed. Mirrors featured.read/featured.write exactly:
-- same scope (activity), same category (content), same role assignments.
-- owner/admin get it automatically via their `SELECT * FROM permissions`
-- pattern in 20260526170000 — only manager/staff/viewer need explicit rows.

INSERT INTO public.permissions (id, scope, category, description) VALUES
  ('stories.read',  'activity', 'content', 'Vedere storie della sede'),
  ('stories.write', 'activity', 'content', 'Modificare storie della sede');

INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('manager', 'stories.read'),
  ('manager', 'stories.write'),
  ('staff',   'stories.read'),
  ('viewer',  'stories.read');
