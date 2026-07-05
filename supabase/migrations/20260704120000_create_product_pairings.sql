-- =============================================================================
-- product_pairings — feature "Abbinamenti"
-- =============================================================================
--
-- Il tenant associa manualmente a un prodotto uno o più prodotti "che ci stanno
-- bene insieme" (generico, non solo vino), con una motivazione opzionale.
--
-- Modello (decisioni Lorenzo, FASE 1):
--   - Mono-direzionale: A→B NON crea B→A (una riga per verso).
--   - Self-pairing vietato: CHECK (product_id <> paired_product_id).
--   - Coppia unica: UNIQUE (product_id, paired_product_id) — no duplicati.
--   - Abbinamenti vincolati allo STESSO catalogo (risoluzione locale in pagina
--     pubblica): nessuna colonna/logica cross-catalogo qui.
--
-- Pattern reference: product_availability_overrides (tabella tenant-scoped
-- admin-only con id proprio + 4 policy get_my_tenant_ids()) +
-- product_characteristic_assignments (join tenant+product, FK CASCADE).
--
-- RLS: admin-only, tenant-scoped. La lettura pubblica degli abbinamenti
-- avverrà via service_role nell'edge function (Tranche C), che bypassa RLS —
-- nessuna policy anon/public serve qui.
--
-- ⚠️ Reference cross-tenant: il WITH CHECK RLS garantisce solo che `tenant_id`
-- sia del chiamante, NON che `product_id`/`paired_product_id` appartengano a
-- quel tenant. Coerente con le join table esistenti (nessun trigger di
-- validazione tenant-consistenza), la coerenza è demandata al service
-- (Tranche B). Punto da coprire in /security-review.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.product_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  paired_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  note text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, paired_product_id),
  CHECK (product_id <> paired_product_id)
);

-- Hot path: "dammi gli abbinamenti di questo prodotto" (lista + dettaglio).
CREATE INDEX IF NOT EXISTS idx_product_pairings_product
  ON public.product_pairings (product_id);

-- Tenant scoping (RLS + admin list).
CREATE INDEX IF NOT EXISTS idx_product_pairings_tenant
  ON public.product_pairings (tenant_id);

-- =========================================
-- RLS — tenant-scoped (admin only)
-- =========================================
ALTER TABLE public.product_pairings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON public.product_pairings;
CREATE POLICY "Tenant select own rows"
ON public.product_pairings
FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_pairings;
CREATE POLICY "Tenant insert own rows"
ON public.product_pairings
FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_pairings;
CREATE POLICY "Tenant update own rows"
ON public.product_pairings
FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()))
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_pairings;
CREATE POLICY "Tenant delete own rows"
ON public.product_pairings
FOR DELETE
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

COMMIT;
