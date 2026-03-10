-- =============================================================================
-- CataloGlobe V2 — Developer Diagnostic Queries
-- NOT for production use. Run in Supabase Studio SQL editor or psql.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tenant ownership overview
--    Lists all tenants with their owner's auth identity.
-- -----------------------------------------------------------------------------
SELECT
    t.id              AS tenant_id,
    t.name,
    t.vertical_type,
    t.owner_user_id,
    u.email           AS owner_email,
    t.created_at
FROM public.v2_tenants t
LEFT JOIN auth.users u ON u.id = t.owner_user_id
ORDER BY t.created_at;


-- -----------------------------------------------------------------------------
-- 2. Orphan tenants
--    Tenants whose owner_user_id does not resolve to a real auth.users row.
--    Should always return 0 rows after Phase 1 migration.
-- -----------------------------------------------------------------------------
SELECT t.*
FROM public.v2_tenants t
LEFT JOIN auth.users u ON u.id = t.owner_user_id
WHERE u.id IS NULL;


-- -----------------------------------------------------------------------------
-- 3. Multi-tenant users
--    Users who own more than one tenant.
-- -----------------------------------------------------------------------------
SELECT
    owner_user_id,
    COUNT(*)  AS tenant_count,
    array_agg(name ORDER BY created_at) AS tenant_names
FROM public.v2_tenants
GROUP BY owner_user_id
HAVING COUNT(*) > 1
ORDER BY tenant_count DESC;


-- -----------------------------------------------------------------------------
-- 4. All tables with a tenant_id column
--    Useful for auditing which tables participate in multi-tenant RLS.
-- -----------------------------------------------------------------------------
SELECT
    table_name,
    column_name,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name  = 'tenant_id'
ORDER BY table_name;


-- -----------------------------------------------------------------------------
-- 5. RLS policy audit
--    Lists all non-service-role policies on v2_* tables.
--    Any policy still referencing auth.uid() directly is a regression risk.
-- -----------------------------------------------------------------------------
SELECT
    tablename,
    policyname,
    cmd,
    roles,
    qual        AS using_expr,
    with_check  AS check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'v2_%'
  AND NOT ('service_role' = ANY(roles))
ORDER BY tablename, cmd;


-- -----------------------------------------------------------------------------
-- 6. Policies still using auth.uid() directly (regression check)
--    Should return 0 rows after Phase 2 migration.
-- -----------------------------------------------------------------------------
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  LIKE 'v2_%'
  AND (
        qual       LIKE '%auth.uid%'
     OR with_check LIKE '%auth.uid%'
      )
  AND NOT ('service_role' = ANY(roles));


-- -----------------------------------------------------------------------------
-- 7. Activity count per tenant
--    Quick sanity check that activities are correctly scoped to their tenants.
-- -----------------------------------------------------------------------------
SELECT
    t.name         AS tenant_name,
    t.owner_user_id,
    COUNT(a.id)    AS activity_count
FROM public.v2_tenants t
LEFT JOIN public.v2_activities a ON a.tenant_id = t.id
GROUP BY t.id, t.name, t.owner_user_id
ORDER BY t.name;


-- -----------------------------------------------------------------------------
-- 8. Cross-tenant data leak check
--    Activities whose tenant_id does not match any v2_tenant.
--    Should always return 0 rows.
-- -----------------------------------------------------------------------------
SELECT a.id, a.tenant_id
FROM public.v2_activities a
LEFT JOIN public.v2_tenants t ON t.id = a.tenant_id
WHERE t.id IS NULL;
