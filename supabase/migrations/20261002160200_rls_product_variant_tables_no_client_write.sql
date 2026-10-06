-- Tabelle della matrice delle varianti: nessuna scrittura da authenticated
-- (PR di sicurezza 1/5, decisione 3 del censimento RLS).
--
-- product_variant_dimensions, _dimension_values, _assignments e
-- _assignment_values non hanno scrittori: src/services/supabase/productVariants.ts
-- non è importato da nessuno, il resolver le legge e basta. Le policy di
-- scrittura per authenticated (20260328100000) tenevano aperta la scrittura a
-- ogni membro dell'azienda. Si tolgono senza rimpiazzo: scrive solo
-- service_role (che salta la RLS). Se un giorno servirà una scrittura dal
-- client, la si riapre col permesso giusto.
--
-- Le SELECT ("Tenant select own rows" e "Public can read …") non si toccano.
-- product_variant_assignment_values non ha mai avuto una policy di UPDATE.

DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_variant_dimensions;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_variant_dimensions;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_variant_dimensions;

DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_variant_dimension_values;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_variant_dimension_values;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_variant_dimension_values;

DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_variant_assignments;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_variant_assignments;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_variant_assignments;

DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_variant_assignment_values;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_variant_assignment_values;

-- Guardia: nessuna policy PERMISSIVE di scrittura per authenticated o PUBLIC
-- deve restare su queste tabelle.
DO $$
DECLARE
  v_leftover text;
BEGIN
  SELECT string_agg(format('%s.%s (%s)', p.tablename, p.policyname, p.cmd), ', ')
  INTO v_leftover
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = ANY (ARRAY['product_variant_dimensions', 'product_variant_dimension_values', 'product_variant_assignments', 'product_variant_assignment_values'])
    AND p.permissive = 'PERMISSIVE'
    AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND (p.roles && ARRAY['authenticated', 'public']::name[]);
  IF v_leftover IS NOT NULL THEN
    RAISE EXCEPTION 'Policy di scrittura residue: %', v_leftover;
  END IF;
END $$;
