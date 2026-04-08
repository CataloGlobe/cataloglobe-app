-- Migrate legacy V1 vertical_type values to V2 equivalents
UPDATE tenants SET vertical_type = 'retail'   WHERE vertical_type IN ('shop');
UPDATE tenants SET vertical_type = 'generic'  WHERE vertical_type IN ('hairdresser', 'beauty', 'other');

-- Add CHECK constraint to enforce only valid V2 values
ALTER TABLE tenants
  ADD CONSTRAINT tenants_vertical_type_check
  CHECK (vertical_type IN ('restaurant', 'bar', 'retail', 'hotel', 'generic'));

-- Update default from 'generic' to 'restaurant'
ALTER TABLE tenants
  ALTER COLUMN vertical_type SET DEFAULT 'restaurant';

-- =====================================================
-- Colonne contatti e servizi su activities
-- =====================================================

ALTER TABLE activities
  ADD COLUMN phone                   TEXT    NULL,
  ADD COLUMN email_public            TEXT    NULL,
  ADD COLUMN website                 TEXT    NULL,
  ADD COLUMN instagram               TEXT    NULL,
  ADD COLUMN facebook                TEXT    NULL,
  ADD COLUMN whatsapp                TEXT    NULL,
  ADD COLUMN phone_public            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN email_public_visible    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN website_public          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN instagram_public        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN facebook_public         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN whatsapp_public         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN payment_methods         TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN payment_methods_public  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN services                TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN services_public         BOOLEAN NOT NULL DEFAULT false;

-- =====================================================
-- Tabella orari di apertura
-- =====================================================

CREATE TABLE activity_hours (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  activity_id  UUID        NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  day_of_week  SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opens_at     TIME        NULL,
  closes_at    TIME        NULL,
  is_closed    BOOLEAN     NOT NULL DEFAULT false,
  hours_public BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_id, day_of_week)
);

ALTER TABLE activity_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_activity_hours" ON activity_hours
  FOR SELECT USING (tenant_id IN (SELECT get_my_tenant_ids()));

CREATE POLICY "insert_activity_hours" ON activity_hours
  FOR INSERT WITH CHECK (tenant_id IN (SELECT get_my_tenant_ids()));

CREATE POLICY "update_activity_hours" ON activity_hours
  FOR UPDATE USING (tenant_id IN (SELECT get_my_tenant_ids()));

CREATE POLICY "delete_activity_hours" ON activity_hours
  FOR DELETE USING (tenant_id IN (SELECT get_my_tenant_ids()));
