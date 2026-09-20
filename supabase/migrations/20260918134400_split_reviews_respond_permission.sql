-- -----------------------------------------------------------------------------
-- Split reviews.respond into reviews.moderate (owner, admin, manager, staff)
-- and reviews.delete (owner, admin). Reviews INSERT/UPDATE now check
-- reviews.moderate, DELETE checks reviews.delete.
-- -----------------------------------------------------------------------------

-- Step 1 — new permissions.
INSERT INTO public.permissions (id, scope, category, description) VALUES
  ('reviews.moderate', 'activity', 'operations', 'Pubblicare e nascondere le recensioni della sede'),
  ('reviews.delete',   'activity', 'operations', 'Eliminare definitivamente le recensioni della sede');

-- Step 2 — role_permissions for the new permissions.
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('owner',   'reviews.moderate'),
  ('admin',   'reviews.moderate'),
  ('manager', 'reviews.moderate'),
  ('staff',   'reviews.moderate'),
  ('owner',   'reviews.delete'),
  ('admin',   'reviews.delete');

-- Step 3 — reviews RLS policies: INSERT/UPDATE -> reviews.moderate,
-- DELETE -> reviews.delete.
DROP POLICY IF EXISTS "Roles can insert reviews" ON public.reviews;
DROP POLICY IF EXISTS "Roles can update reviews" ON public.reviews;
DROP POLICY IF EXISTS "Roles can delete reviews" ON public.reviews;

CREATE POLICY "Roles can insert reviews"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('reviews.moderate', activity_id));

CREATE POLICY "Roles can update reviews"
  ON public.reviews FOR UPDATE TO authenticated
  USING       (public.has_permission('reviews.moderate', activity_id))
  WITH CHECK  (public.has_permission('reviews.moderate', activity_id));

CREATE POLICY "Roles can delete reviews"
  ON public.reviews FOR DELETE TO authenticated
  USING (public.has_permission('reviews.delete', activity_id));

-- Step 4 — drop reviews.respond. ON DELETE CASCADE removes its
-- role_permissions rows (owner/admin/manager/staff).
DELETE FROM public.permissions WHERE id = 'reviews.respond';
