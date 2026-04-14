-- Analytics events table for public page tracking
-- All events are anonymous (no personal data), grouped by session_id

CREATE TABLE analytics_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  activity_id     UUID NOT NULL REFERENCES activities(id),
  event_type      TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',
  session_id      UUID,
  device_type     TEXT,
  screen_width    INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_event_type CHECK (event_type IN (
    'page_view',
    'product_detail_open',
    'selection_add',
    'selection_remove',
    'selection_sheet_open',
    'featured_click',
    'social_click',
    'search_performed',
    'tab_switch',
    'section_view',
    'review_submitted',
    'review_google_redirect'
  )),

  CONSTRAINT valid_device_type CHECK (device_type IS NULL OR device_type IN (
    'mobile', 'tablet', 'desktop'
  ))
);

-- Indici per query aggregate
CREATE INDEX idx_analytics_events_activity_type_created
  ON analytics_events (activity_id, event_type, created_at DESC);

CREATE INDEX idx_analytics_events_tenant_created
  ON analytics_events (tenant_id, created_at DESC);

CREATE INDEX idx_analytics_events_session
  ON analytics_events (session_id, created_at DESC);

-- RLS
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON analytics_events;
DROP POLICY IF EXISTS "Tenant insert own rows" ON analytics_events;
DROP POLICY IF EXISTS "Tenant update own rows" ON analytics_events;
DROP POLICY IF EXISTS "Tenant delete own rows" ON analytics_events;

CREATE POLICY "Tenant select own rows"
  ON analytics_events FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant insert own rows"
  ON analytics_events FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant update own rows"
  ON analytics_events FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant delete own rows"
  ON analytics_events FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));
