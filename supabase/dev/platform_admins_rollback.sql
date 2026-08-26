-- =============================================================================
-- CataloGlobe V2 — Rollback: platform_admins + is_platform_admin()
--
-- NON e' una migration. Non vive in supabase/migrations/ e non viene applicato
-- da `supabase db push`. Si esegue A MANO in Supabase Studio SQL editor (o
-- psql) e SOLO per annullare l'introduzione di `platform_admins` (Fase 2A,
-- migration 20260826100000 → 20260826100003).
--
-- ATTENZIONE — ordine delle operazioni. Prima di eseguire questo script:
--   1. ripristinare il codice alla versione env-var
--      (src/components/Routes/AdminRoute.tsx + api/admin/status-incidents.ts);
--   2. riattivare ADMIN_EMAIL / VITE_ADMIN_EMAIL su Vercel e ri-deployare.
-- Invertire l'ordine lascia l'area /admin inaccessibile a chiunque: il nuovo
-- controllo e' fail-closed by design, e senza la funzione la RPC fallisce.
-- =============================================================================

-- Drop in ordine inverso rispetto all'applicazione.

-- 20260826100003 — policy SELECT
DROP POLICY IF EXISTS "Platform admins can read platform_admins" ON public.platform_admins;

-- 20260826100002 (ACL) + 20260826100001 (funzione)
-- Il DROP FUNCTION porta via anche i GRANT.
DROP FUNCTION IF EXISTS public.is_platform_admin();

-- 20260826100000 — policy di deny + tabella
DROP POLICY IF EXISTS "No direct INSERT on platform_admins" ON public.platform_admins;
DROP POLICY IF EXISTS "No direct UPDATE on platform_admins" ON public.platform_admins;
DROP POLICY IF EXISTS "No direct DELETE on platform_admins" ON public.platform_admins;

DROP TABLE IF EXISTS public.platform_admins;


-- -----------------------------------------------------------------------------
-- Registro migration
-- -----------------------------------------------------------------------------
-- Senza questo DELETE, `supabase db push` considera le 4 migration gia'
-- applicate e non le ri-applica mai piu' su questo ambiente.

-- DELETE FROM supabase_migrations.schema_migrations
-- WHERE version IN (
--     '20260826100000',
--     '20260826100001',
--     '20260826100002',
--     '20260826100003'
-- );
