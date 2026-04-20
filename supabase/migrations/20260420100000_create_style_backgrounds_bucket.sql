-- Create style-backgrounds storage bucket for per-style background images
INSERT INTO storage.buckets (id, name, public)
VALUES ('style-backgrounds', 'style-backgrounds', true)
ON CONFLICT (id) DO NOTHING;

-- Allow tenant members to upload/overwrite their own style backgrounds
CREATE POLICY "Tenant members can upload style backgrounds"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'style-backgrounds'
    AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM tenants WHERE id IN (SELECT get_my_tenant_ids())
    )
);

-- Allow tenant members to overwrite (upsert) their own style backgrounds
CREATE POLICY "Tenant members can update style backgrounds"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'style-backgrounds'
    AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM tenants WHERE id IN (SELECT get_my_tenant_ids())
    )
);

-- Allow tenant members to delete their own style backgrounds
CREATE POLICY "Tenant members can delete style backgrounds"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'style-backgrounds'
    AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM tenants WHERE id IN (SELECT get_my_tenant_ids())
    )
);

-- Public read (bucket is public, but explicit SELECT policy for clarity)
CREATE POLICY "Style backgrounds are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'style-backgrounds');
