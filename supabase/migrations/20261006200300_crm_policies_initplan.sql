-- =============================================================================
-- CRM: policy RLS valutate una volta per query, non per riga
-- =============================================================================
--
-- Le 68 policy delle tabelle crm_* chiamano is_platform_admin() (e in due
-- casi auth.uid()) nude: Postgres le rivaluta per ogni riga letta. Avvolte
-- in una SELECT diventano un initplan, calcolato una volta sola. Stessa
-- regola, stessi ruoli, stesso comando: cambia solo come viene valutata.
-- Le policy che contengono già una SELECT si saltano (idempotente).
--
-- Poi i privilegi di tabella che nessuna policy usa: TRUNCATE (che ignora
-- l'RLS), REFERENCES e TRIGGER tolti ad authenticated su tutte le crm_*.
-- Il client non li usa; le edge girano col service role.
-- =============================================================================

DO $$
DECLARE
    p record;
    v_using text;
    v_check text;
    v_sql text;
BEGIN
    FOR p IN
        SELECT pol.tablename, pol.policyname, pol.qual, pol.with_check
        FROM pg_catalog.pg_policies pol
        WHERE pol.schemaname = 'public'
          AND pol.tablename LIKE 'crm\_%'
          AND coalesce(pol.qual, '') || coalesce(pol.with_check, '') ~ '(is_platform_admin|auth\.uid)\(\)'
          AND coalesce(pol.qual, '') || coalesce(pol.with_check, '') !~* 'select'
    LOOP
        v_using := regexp_replace(regexp_replace(p.qual,
            '(public\.)?is_platform_admin\(\)', '(SELECT public.is_platform_admin())', 'g'),
            'auth\.uid\(\)', '(SELECT auth.uid())', 'g');
        v_check := regexp_replace(regexp_replace(p.with_check,
            '(public\.)?is_platform_admin\(\)', '(SELECT public.is_platform_admin())', 'g'),
            'auth\.uid\(\)', '(SELECT auth.uid())', 'g');

        v_sql := format('ALTER POLICY %I ON public.%I', p.policyname, p.tablename);
        IF v_using IS NOT NULL THEN
            v_sql := v_sql || format(' USING (%s)', v_using);
        END IF;
        IF v_check IS NOT NULL THEN
            v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
        END IF;
        EXECUTE v_sql;
    END LOOP;

    FOR p IN
        SELECT c.relname
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'crm\_%'
    LOOP
        EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', p.relname);
    END LOOP;
END
$$;
