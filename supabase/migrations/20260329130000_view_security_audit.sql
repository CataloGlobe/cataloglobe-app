-- =============================================================================
-- AUDIT: VIEW security scan — detect views with unfiltered tenant access
-- =============================================================================
--
-- PURPOSE
--   PostgreSQL views execute as their owner (postgres in Supabase) and
--   therefore BYPASS Row Level Security entirely. Any view that reads
--   user-scoped tables (tenants, tenant_memberships) without an explicit
--   auth.uid() or auth.email() filter in its WHERE clause is a potential
--   data-leak vector.
--
--   This migration does NOT fix those views — it surfaces them as WARNINGs
--   so they can be addressed deliberately. The migration will always succeed
--   (RAISE WARNING, never RAISE EXCEPTION), ensuring it does not block deploy.
--
-- HOW TO REVIEW WARNINGS
--   After running this migration, check the Supabase migration logs for lines
--   matching "SECURITY AUDIT". Each warning includes the view name and its
--   full definition for manual review.
--
-- VIEWS KNOWN-SAFE (excluded from warnings):
--   user_tenants_view     — delegates to get_user_tenants() (SECURITY DEFINER)
--   my_pending_invites_view — filters on auth.email() explicitly
--
-- WARNING:
--   This audit is a snapshot in time. Run this migration whenever a new VIEW
--   is added to the public schema to catch regressions early.
--
-- =============================================================================

DO $$
DECLARE
  v               record;
  suspicious_count int := 0;
  safe_views       text[] := ARRAY[
    'user_tenants_view',
    'my_pending_invites_view'
  ];
BEGIN

  -- -------------------------------------------------------------------------
  -- Scan all views in the public schema that reference tenant tables and do
  -- NOT contain an explicit auth.uid() or auth.email() call.
  -- -------------------------------------------------------------------------
  FOR v IN
    SELECT
      schemaname,
      viewname,
      definition
    FROM pg_views
    WHERE schemaname = 'public'
      -- View references one of the sensitive tenant tables —
      -- check both bare name and FROM/JOIN prefixed variants.
      AND (
        definition ILIKE '%tenants%'
        OR definition ILIKE '%tenant_memberships%'
        OR definition ILIKE '%FROM %tenants%'
        OR definition ILIKE '%JOIN %tenants%'
      )
      -- View does NOT contain an explicit auth filter — potential leak
      AND definition NOT ILIKE '%auth.uid()%'
      AND definition NOT ILIKE '%auth.email()%'
      -- Exclude views known to be safe (delegate to SECURITY DEFINER functions)
      AND viewname NOT IN (
        'user_tenants_view',
        'my_pending_invites_view'
      )
    ORDER BY viewname
  LOOP
    suspicious_count := suspicious_count + 1;

    RAISE WARNING
      E'SECURITY AUDIT — suspicious view detected:\n'
      '  View   : public.%\n'
      '  Reason : references tenant data but lacks auth.uid() / auth.email() filter\n'
      '  Action : verify the view has an explicit user-scoping WHERE clause,\n'
      '           or rewrites as a SECURITY DEFINER function.\n'
      '  Definition (first 500 chars):\n%',
      v.viewname,
      left(v.definition, 500);
  END LOOP;


  -- -------------------------------------------------------------------------
  -- Summarise findings
  -- -------------------------------------------------------------------------
  IF suspicious_count = 0 THEN
    RAISE NOTICE
      'SECURITY AUDIT PASSED: no unfiltered views referencing tenant tables found.';
  ELSE
    RAISE WARNING
      'SECURITY AUDIT: % suspicious view(s) detected. '
      'Review the warnings above and add explicit auth.uid() / auth.email() '
      'filters or delegate to a SECURITY DEFINER function.',
      suspicious_count;
  END IF;


  -- -------------------------------------------------------------------------
  -- Verify known-safe views still exist and have expected auth filters
  -- -------------------------------------------------------------------------
  -- user_tenants_view must delegate to get_user_tenants()
  DECLARE
    utv_def text;
  BEGIN
    SELECT definition INTO utv_def
    FROM pg_views
    WHERE schemaname = 'public' AND viewname = 'user_tenants_view';

    IF utv_def IS NULL THEN
      RAISE WARNING
        'SECURITY AUDIT: user_tenants_view not found. '
        'The primary tenant-listing view is missing.';
    ELSIF utv_def NOT ILIKE '%get_user_tenants%' THEN
      RAISE WARNING
        'SECURITY AUDIT: user_tenants_view does NOT delegate to get_user_tenants(). '
        'The view may expose ALL tenants to any authenticated user. '
        'Run migration 20260329110000 to fix this.';
    ELSE
      RAISE NOTICE
        'SECURITY AUDIT: user_tenants_view correctly delegates to get_user_tenants().';
    END IF;
  END;

  -- my_pending_invites_view must filter on auth.email() or auth.uid()
  DECLARE
    mpv_def text;
  BEGIN
    SELECT definition INTO mpv_def
    FROM pg_views
    WHERE schemaname = 'public' AND viewname = 'my_pending_invites_view';

    IF mpv_def IS NULL THEN
      RAISE WARNING
        'SECURITY AUDIT: my_pending_invites_view not found.';
    ELSIF mpv_def NOT ILIKE '%auth.email()%'
      AND mpv_def NOT ILIKE '%auth.uid()%' THEN
      RAISE WARNING
        'SECURITY AUDIT: my_pending_invites_view lacks auth.email() / auth.uid() filter.';
    ELSE
      RAISE NOTICE
        'SECURITY AUDIT: my_pending_invites_view has explicit auth filter — safe.';
    END IF;
  END;

END $$;

-- No schema changes in this migration — audit only.
-- =============================================================================
-- ISOLATION TEST DOCUMENTATION
-- =============================================================================
--
-- The following queries can be run in the Supabase SQL editor while authenticated
-- as different users to validate tenant isolation manually.
--
-- Test 1 — Utente senza tenant: deve restituire 0 righe
--   SELECT * FROM public.user_tenants_view;
--   SELECT * FROM public.get_user_tenants();
--   -- Expected: 0 rows
--
-- Test 2 — Utente con 1 tenant: deve restituire solo il suo
--   SELECT id, name, user_role FROM public.user_tenants_view;
--   -- Expected: exactly 1 row; user_role = 'owner'
--
-- Test 3 — Nessun user_role NULL
--   SELECT * FROM public.user_tenants_view WHERE user_role IS NULL;
--   -- Expected: 0 rows (the WHERE guard prevents unmatched rows)
--
-- Test 4 — Consistenza funzione vs view (deve restituire 0 righe)
--   SELECT id FROM public.user_tenants_view
--   EXCEPT
--   SELECT id FROM public.get_user_tenants();
--   -- Expected: 0 rows (function and view return identical sets)
--
-- Test 5 — Isolamento tra utenti
--   -- Eseguire da User A: SELECT array_agg(id) FROM public.get_user_tenants();
--   -- Eseguire da User B: SELECT array_agg(id) FROM public.get_user_tenants();
--   -- Expected: overlap SOLO se esiste una membership condivisa tra A e B.
--   --           Due utenti senza relazione devono avere set completamente disgiunti.
--
-- =============================================================================
