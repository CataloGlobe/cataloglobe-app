BEGIN;

-- =============================================================================
-- Subscription refactor — Step 7/8: activity_addons (per-activity addon link)
-- =============================================================================
--
-- Schema-only: no UI, no Edge function. The table exists so that future flows
-- can attach an addon to a single activity and reconcile with Stripe via
-- `stripe_subscription_item_id`.
--
-- Soft-delete via `deactivated_at` (NULL = active). UNIQUE partial index
-- ensures one ACTIVE row per (activity, addon).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.activity_addons (
    id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid        NOT NULL REFERENCES public.tenants(id)    ON DELETE CASCADE,
    activity_id                 uuid        NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    addon_id                    text        NOT NULL REFERENCES public.addons(id),
    activated_at                timestamptz NOT NULL DEFAULT now(),
    deactivated_at              timestamptz,
    stripe_subscription_item_id text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_addons_tenant_id
    ON public.activity_addons (tenant_id);

CREATE INDEX IF NOT EXISTS idx_activity_addons_activity_id
    ON public.activity_addons (activity_id);

CREATE INDEX IF NOT EXISTS idx_activity_addons_addon_id
    ON public.activity_addons (addon_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_addons_active_per_activity_addon
    ON public.activity_addons (activity_id, addon_id)
    WHERE deactivated_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_activity_addons ON public.activity_addons;
CREATE TRIGGER set_updated_at_activity_addons
    BEFORE UPDATE ON public.activity_addons
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- RLS — standard tenant-scoped 4-policy pattern via get_my_tenant_ids().
-- (We keep it tenant-scoped, not has_permission-scoped, because billing
--  resources align with tenant ownership, not activity-level operator role.)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.activity_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read activity_addons" ON public.activity_addons;
CREATE POLICY "Members can read activity_addons"
    ON public.activity_addons FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Members can insert activity_addons" ON public.activity_addons;
CREATE POLICY "Members can insert activity_addons"
    ON public.activity_addons FOR INSERT TO authenticated
    WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Members can update activity_addons" ON public.activity_addons;
CREATE POLICY "Members can update activity_addons"
    ON public.activity_addons FOR UPDATE TO authenticated
    USING      (tenant_id IN (SELECT public.get_my_tenant_ids()))
    WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Members can delete activity_addons" ON public.activity_addons;
CREATE POLICY "Members can delete activity_addons"
    ON public.activity_addons FOR DELETE TO authenticated
    USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- ────────────────────────────────────────────────────────────────────────────
-- Validation
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    policy_count int;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'activity_addons'
    ) THEN
        RAISE EXCEPTION 'FAIL: activity_addons table missing.';
    END IF;
    RAISE NOTICE 'OK: activity_addons table present.';

    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_addons';

    IF policy_count = 4 THEN
        RAISE NOTICE 'OK: 4 RLS policies on activity_addons.';
    ELSE
        RAISE EXCEPTION 'FAIL: only %/4 RLS policies on activity_addons.', policy_count;
    END IF;
END $$;

COMMIT;
