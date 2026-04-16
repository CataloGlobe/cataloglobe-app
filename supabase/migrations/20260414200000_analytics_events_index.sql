CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_type_created
  ON analytics_events (tenant_id, event_type, created_at DESC);
