-- =============================================================================
-- Cleanup — rimozione righe legacy role='owner' da tenant_memberships
--
-- Debito tecnico da Fase 1 multi-tenant.
--
-- Stato pre-migration (verificato su staging):
--   - 11 righe in public.tenant_memberships con role='owner'
--     (una per ogni tenant esistente)
--   - Per ogni riga: tm.user_id = tenants.owner_user_id (match 100%)
--   - Sono ridondanti: l'owner canonico vive in public.tenants.owner_user_id
--
-- Dopo Fase 2 (multi-sede permissions) il modello prevede:
--   - owner: ESCLUSIVAMENTE in tenants.owner_user_id, NESSUNA riga in tm
--   - admin: tm.role = 'admin' (scope tenant-wide)
--   - manager/staff/viewer: tm.role = NULL + tma rows (scope activity)
--
-- Le righe legacy role='owner' violano questa invariante. Vanno cancellate.
-- Il check constraint va ristretto per impedire ricreazione futura.
--
-- Impatto:
--   - get_tenant_members v2 (20260530180000) NON dipende più da queste righe:
--     genera owner row synthetic da tenants.owner_user_id.
--   - get_user_tenants (view) usa CASE WHEN owner_user_id = auth.uid()
--     THEN 'owner' — già robusto, non legge tm per owner.
--   - has_permission BRANCH 1 cerca owner in tenants, non in tm.
--   - has_permission BRANCH 2 cerca admin in tm (post-cleanup invariata).
--
-- ⚠️ PRE-DEPLOY PROD:
--   Prima del push, eseguire assessment sui dati prod:
--     SELECT tm.tenant_id, tm.user_id, t.owner_user_id,
--            (tm.user_id = t.owner_user_id) AS matches
--     FROM public.tenant_memberships tm
--     JOIN public.tenants t ON t.id = tm.tenant_id
--     WHERE tm.role = 'owner';
--   Se anche UNA sola riga ha matches=false, FERMARSI e indagare prima di
--   applicare. La cancellazione presuppone matching 100%.
-- =============================================================================

-- Step 1 — DELETE righe legacy role='owner'
DELETE FROM public.tenant_memberships WHERE role = 'owner';

-- Step 2 — DROP vecchio constraint
ALTER TABLE public.tenant_memberships
  DROP CONSTRAINT IF EXISTS tenant_memberships_role_check;

-- Step 3 — ADD nuovo constraint (solo NULL o 'admin')
ALTER TABLE public.tenant_memberships
  ADD CONSTRAINT tenant_memberships_role_check
  CHECK (role IS NULL OR role = 'admin');
