-- ============================================================
-- table_zones — entita' separata per le zone tavoli (γ-lite).
-- Sostituisce il campo `tables.zone` text libero con FK su nuova
-- tabella `table_zones`. Migration atomica:
--   1. CREATE table_zones
--   2. RLS (pattern has_permission)
--   3. ALTER tables ADD zone_id (FK ON DELETE SET NULL)
--   4. Backfill: 1 riga table_zones per ogni (activity_id, zone) distinct
--   5. DROP v_tables_with_state (depende da tables.zone), DROP tables.zone
--   6. RECREATE v_tables_with_state con LEFT JOIN table_zones (espone zone_name)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. CREATE TABLE table_zones
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.table_zones (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    activity_id  uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    name         text NOT NULL,
    sort_order   integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT table_zones_name_not_empty
        CHECK (length(trim(name)) > 0),
    CONSTRAINT table_zones_unique_name_per_activity
        UNIQUE (activity_id, name)
);

CREATE INDEX idx_table_zones_activity_id ON public.table_zones (activity_id);
CREATE INDEX idx_table_zones_tenant_id ON public.table_zones (tenant_id);

-- Trigger updated_at — riusa public.set_updated_at() (gia presente nello schema)
CREATE TRIGGER set_updated_at_table_zones
    BEFORE UPDATE ON public.table_zones
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 2. RLS table_zones — pattern has_permission (tables.read / tables.manage)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.table_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Roles can read table_zones" ON public.table_zones;
CREATE POLICY "Roles can read table_zones"
    ON public.table_zones FOR SELECT TO authenticated
    USING (has_permission('tables.read', activity_id));

DROP POLICY IF EXISTS "Roles can insert table_zones" ON public.table_zones;
CREATE POLICY "Roles can insert table_zones"
    ON public.table_zones FOR INSERT TO authenticated
    WITH CHECK (has_permission('tables.manage', activity_id));

DROP POLICY IF EXISTS "Roles can update table_zones" ON public.table_zones;
CREATE POLICY "Roles can update table_zones"
    ON public.table_zones FOR UPDATE TO authenticated
    USING (has_permission('tables.manage', activity_id))
    WITH CHECK (has_permission('tables.manage', activity_id));

DROP POLICY IF EXISTS "Roles can delete table_zones" ON public.table_zones;
CREATE POLICY "Roles can delete table_zones"
    ON public.table_zones FOR DELETE TO authenticated
    USING (has_permission('tables.manage', activity_id));

-- ────────────────────────────────────────────────────────────
-- 3. ALTER tables ADD zone_id
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.tables
    ADD COLUMN zone_id uuid NULL
        REFERENCES public.table_zones(id) ON DELETE SET NULL;

CREATE INDEX idx_tables_zone_id ON public.tables (zone_id);

-- ────────────────────────────────────────────────────────────
-- 4. Backfill: distinct (activity_id, zone) → table_zones, poi UPDATE FK
-- ────────────────────────────────────────────────────────────
INSERT INTO public.table_zones (tenant_id, activity_id, name, sort_order)
SELECT DISTINCT t.tenant_id, t.activity_id, trim(t.zone), 0
FROM public.tables t
WHERE t.zone IS NOT NULL
  AND trim(t.zone) <> ''
  AND t.deleted_at IS NULL;

UPDATE public.tables t
SET zone_id = tz.id
FROM public.table_zones tz
WHERE tz.activity_id = t.activity_id
  AND tz.name = trim(t.zone)
  AND t.zone IS NOT NULL
  AND trim(t.zone) <> '';

-- ────────────────────────────────────────────────────────────
-- 5. DROP view dipendente, DROP colonna tables.zone
-- ────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_tables_with_state CASCADE;

ALTER TABLE public.tables DROP COLUMN zone;

-- ────────────────────────────────────────────────────────────
-- 6. RECREATE v_tables_with_state — JOIN table_zones, espone zone_name
--    Logica aggregati IDENTICA all'originale (vedi pg_get_viewdef pre-migration).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_tables_with_state AS
SELECT
    t.id,
    t.tenant_id,
    t.activity_id,
    t.label,
    t.qr_token,
    t.seats,
    t.zone_id,
    tz.name AS zone_name,
    t.maintenance_mode,
    t.deleted_at,
    t.created_at,
    t.updated_at,
    count(DISTINCT cs.id) FILTER (WHERE cs.expires_at > now())
        AS active_sessions_count,
    count(DISTINCT o.id) FILTER (WHERE o.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text]))
        AS pending_orders_count,
    count(DISTINCT og.id) FILTER (WHERE og.status = 'open'::text)
        AS open_groups_count,
    COALESCE(
        sum(o.total_amount) FILTER (
            WHERE (o.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'delivered'::text]))
              AND o.is_rectification = false
        )
        - sum(o.total_amount) FILTER (
            WHERE (o.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'delivered'::text]))
              AND o.is_rectification = true
        ),
        0::numeric
    ) AS current_total,
    count(DISTINCT cs.id) FILTER (
        WHERE cs.expires_at > now() AND cs.bill_requested_at IS NOT NULL
    ) AS bill_requested_count
FROM public.tables t
    LEFT JOIN public.table_zones tz ON tz.id = t.zone_id
    LEFT JOIN public.customer_sessions cs ON cs.current_table_id = t.id
    LEFT JOIN public.orders o ON o.table_id = t.id AND o.cancelled_at IS NULL
    LEFT JOIN public.order_groups og ON og.table_id = t.id
WHERE t.deleted_at IS NULL
GROUP BY t.id, tz.name;
