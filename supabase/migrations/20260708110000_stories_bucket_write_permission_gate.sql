-- Security fix (broken_access_control, Medium): storage.objects policies for
-- the `stories` bucket gated only on tenant membership, not stories.write —
-- staff/viewer (stories.read only, per 20260707125900/20260707150000) could
-- overwrite story/brand-cover objects directly via the storage API, bypassing
-- the stories.write gate the TABLE (20260707130000) and the cappello RPC
-- (20260708100000) both correctly enforce. Deterministic paths
-- (<tenant_id>/<file>.<ext>, incl. the static "brand-cover" file used by the
-- cappello panel) + public bucket made this directly exploitable.
--
-- Fix: add has_permission_any_activity('stories.write', tenant_id) to
-- INSERT/UPDATE/DELETE, same tenant_id extraction as the existing policies
-- (storage.foldername(name))[1]::uuid. SELECT untouched — bucket is public
-- read anyway, no write risk there.

DROP POLICY IF EXISTS "stories insert" ON storage.objects;
CREATE POLICY "stories insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'stories'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
  AND has_permission_any_activity('stories.write', (storage.foldername(name))[1]::uuid)
);

DROP POLICY IF EXISTS "stories update" ON storage.objects;
CREATE POLICY "stories update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'stories'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
  AND has_permission_any_activity('stories.write', (storage.foldername(name))[1]::uuid)
)
WITH CHECK (
  bucket_id = 'stories'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
  AND has_permission_any_activity('stories.write', (storage.foldername(name))[1]::uuid)
);

DROP POLICY IF EXISTS "stories delete" ON storage.objects;
CREATE POLICY "stories delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'stories'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
  AND has_permission_any_activity('stories.write', (storage.foldername(name))[1]::uuid)
);
