-- Storage bucket + policies for Stories cover uploads (story cover + tenant
-- "cappello" story_cover). Mirrors featured-contents bucket 1:1: same
-- per-tenant folder convention (<tenant_id>/<file>.<ext>), same 4 policies.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('stories', 'stories', true, 6291456, ARRAY['image/jpeg', 'image/png', 'image/webp']);

DROP POLICY IF EXISTS "stories select" ON storage.objects;
CREATE POLICY "stories select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'stories'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
);

DROP POLICY IF EXISTS "stories insert" ON storage.objects;
CREATE POLICY "stories insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'stories'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
);

DROP POLICY IF EXISTS "stories update" ON storage.objects;
CREATE POLICY "stories update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'stories'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
)
WITH CHECK (
  bucket_id = 'stories'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
);

DROP POLICY IF EXISTS "stories delete" ON storage.objects;
CREATE POLICY "stories delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'stories'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_tenant_ids())
);
