-- Security fix (broken_access_control, Medium): storage.objects write policies
-- for `featured-contents` and `product-images` gated only on tenant membership
-- ((storage.foldername(name))[1] IN get_my_tenant_ids()), not on a domain
-- .write permission — staff/viewer could overwrite public cover/product images
-- directly via the storage API, bypassing the UI permission gate. Same class
-- of bug already fixed on the `stories` bucket (20260708110000).
--
-- Fix: add has_permission_any_activity('<domain>.write', tenant_id) to
-- INSERT/UPDATE/DELETE, same tenant_id extraction as the existing policies
-- ((storage.foldername(name))[1])::uuid. SELECT untouched — both buckets are
-- public read, no write risk there.
--
-- has_permission_any_activity(permission_id, tenant_id) is used (not
-- has_permission(permission_id, activity_id)) because these bucket paths only
-- encode tenant_id, not activity_id — same choice stories made. It is safe
-- for both a tenant-scoped permission (products.write) and an activity-scoped
-- one (featured.write): it checks role_permissions.permission_id against the
-- SPECIFIC p_tenant_id (owner/admin of that tenant, or any activity-scoped
-- role within it) with no cross-tenant leak, unlike has_permission() with a
-- NULL activity_id which checks the caller's OWN tenant(s) generically.

-- =============================================================================
-- featured-contents (featured.write, scope=activity)
-- =============================================================================

DROP POLICY IF EXISTS "featured-contents insert" ON storage.objects;
CREATE POLICY "featured-contents insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'featured-contents'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
  AND has_permission_any_activity('featured.write', (storage.foldername(name))[1]::uuid)
);

DROP POLICY IF EXISTS "featured-contents update" ON storage.objects;
CREATE POLICY "featured-contents update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'featured-contents'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
  AND has_permission_any_activity('featured.write', (storage.foldername(name))[1]::uuid)
)
WITH CHECK (
  bucket_id = 'featured-contents'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
  AND has_permission_any_activity('featured.write', (storage.foldername(name))[1]::uuid)
);

DROP POLICY IF EXISTS "featured-contents delete" ON storage.objects;
CREATE POLICY "featured-contents delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'featured-contents'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
  AND has_permission_any_activity('featured.write', (storage.foldername(name))[1]::uuid)
);

-- =============================================================================
-- product-images (products.write, scope=tenant)
-- =============================================================================

DROP POLICY IF EXISTS "product-images insert" ON storage.objects;
CREATE POLICY "product-images insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
  AND has_permission_any_activity('products.write', (storage.foldername(name))[1]::uuid)
);

DROP POLICY IF EXISTS "product-images update" ON storage.objects;
CREATE POLICY "product-images update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
  AND has_permission_any_activity('products.write', (storage.foldername(name))[1]::uuid)
)
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
  AND has_permission_any_activity('products.write', (storage.foldername(name))[1]::uuid)
);

DROP POLICY IF EXISTS "product-images delete" ON storage.objects;
CREATE POLICY "product-images delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
  AND has_permission_any_activity('products.write', (storage.foldername(name))[1]::uuid)
);
