-- Stories: brand/activity content feed
CREATE TABLE public.stories (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES public.activities(id) ON DELETE CASCADE,
  eyebrow TEXT,
  title TEXT NOT NULL,
  cover_media TEXT,
  body_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status = ANY (ARRAY['draft'::text, 'published'::text])),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stories_tenant_activity ON public.stories USING btree (tenant_id, activity_id);
CREATE INDEX idx_stories_product ON public.stories USING btree (product_id);
CREATE INDEX idx_stories_tenant_status_sort ON public.stories USING btree (tenant_id, status, sort_order);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Roles can read stories"
ON public.stories
FOR SELECT
USING (tenant_id IN (SELECT get_my_tenant_ids()));

CREATE POLICY "Roles can insert stories"
ON public.stories
FOR INSERT
WITH CHECK (
  (tenant_id IN (SELECT get_my_tenant_ids()))
  AND has_permission_any_activity('stories.write', tenant_id)
);

CREATE POLICY "Roles can update stories"
ON public.stories
FOR UPDATE
USING (
  (tenant_id IN (SELECT get_my_tenant_ids()))
  AND has_permission_any_activity('stories.write', tenant_id)
)
WITH CHECK (
  (tenant_id IN (SELECT get_my_tenant_ids()))
  AND has_permission_any_activity('stories.write', tenant_id)
);

CREATE POLICY "Roles can delete stories"
ON public.stories
FOR DELETE
USING (
  (tenant_id IN (SELECT get_my_tenant_ids()))
  AND has_permission_any_activity('stories.write', tenant_id)
);
