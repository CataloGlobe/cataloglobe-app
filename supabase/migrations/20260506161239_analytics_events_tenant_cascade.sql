-- Drop and recreate analytics_events.tenant_id_fkey with ON DELETE CASCADE.
-- Rationale: analytics_events is ephemeral telemetry; if the tenant is
-- hard-deleted, the events lose semantic meaning and should be removed.
-- This aligns with the previous fix on analytics_events.activity_id_fkey
-- (migration 20260506131237) and with 24/36 FKs on tenants.id which already
-- use CASCADE.
--
-- Bug context: previous NO ACTION caused 23503 errors blocking tenant
-- hard-delete in tenant-purge.ts. The cron `purge-tenants` would have
-- failed silently on tenants with telemetry rows after the 30-day grace
-- period, leaving zombie tenant rows after partial cascade of 23 child
-- tables and storage cleanup.
--
-- Known impact at time of migration: tenant 82bb19ba-4f28-4b33-9678-
-- 9fd7f5f77a21 ("Test slug") has 20 analytics_events rows and is purge
-- eligible from 2026-05-17. After this migration the cron purge will
-- succeed naturally; alternatively the owner can call purge-tenant-now
-- to clean it up immediately.

ALTER TABLE public.analytics_events
    DROP CONSTRAINT analytics_events_tenant_id_fkey;

ALTER TABLE public.analytics_events
    ADD CONSTRAINT analytics_events_tenant_id_fkey
        FOREIGN KEY (tenant_id)
        REFERENCES public.tenants(id)
        ON DELETE CASCADE;
