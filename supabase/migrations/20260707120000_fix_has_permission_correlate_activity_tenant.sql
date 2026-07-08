-- =============================================================================
-- SECURITY FIX — has_permission(): correlare i branch owner/admin (1 e 2) al
-- tenant proprietario di p_activity_id.
--
-- LEAK (confermato su staging, audit 2026-07-07):
--   I branch 1 (owner) e 2 (admin) concedevano il permesso verificando solo
--   che il chiamante fosse owner/admin di *un* tenant qualsiasi con quel
--   permesso nel seed role_permissions — SENZA verificare che quel tenant
--   fosse il proprietario di p_activity_id. Poiché le policy RLS di
--   orders / order_groups / order_items / customer_sessions (e ogni altra
--   tabella activity-scoped) usano has_permission('X', activity_id) come
--   unico gate, un owner/admin del tenant A otteneva CRUD cross-tenant su
--   ordini/sessioni del tenant B via PostgREST diretto.
--
--   Prova (staging): owner del tenant A (7bab4e9d…), NON membro del tenant B
--   (bbf43337… San Pietro), otteneva has_permission('orders.read'|'manage',
--   <activity di B>) = TRUE tramite il solo branch 1.
--
-- FIX:
--   Nei branch 1 e 2 aggiungere la correlazione al tenant di p_activity_id:
--     p_activity_id IS NULL
--     OR EXISTS (activities a WHERE a.id = p_activity_id AND a.tenant_id = t.id)
--
--   - Quando p_activity_id È NULL (permessi tenant-scoped chiamati senza
--     activity, es. team.read/scheduling.write NULL) → comportamento
--     INVARIATO: owner/admin del proprio tenant con quel permesso.
--   - Quando p_activity_id è valorizzato → owner/admin deve possedere/
--     amministrare il tenant che possiede quella activity. Fail-closed:
--     se l'activity non esiste, EXISTS = false → nega.
--
--   Branch 3 (permessi tenant-scoped via ruolo activity) e branch 4
--   (permessi activity-scoped, già correlato a tma.activity_id) NON toccati.
--
-- SICUREZZA / PATTERN:
--   - SECURITY DEFINER + SET search_path TO '' + qualifiche public.* invariati.
--   - LANGUAGE convertito da sql a plpgsql (prudenza): stessa classe di bug
--     di planner-inlining che colpì has_permission_any_activity in WITH CHECK
--     (silent 42501 su INSERT, risolto in 20260529100000 con la stessa
--     conversione). plpgsql NON viene mai inline dal planner. Logica dei 4
--     branch identica; comportamento semantico invariato (verificato: i 3
--     scenari dell'audit FASE 1 restano leak=false / no-regressione).
--   - CREATE OR REPLACE preserva l'ACL esistente; i REVOKE/GRANT sono
--     ri-emessi esplicitamente per idempotenza cross-env (allineati allo
--     stato live: EXECUTE a service_role, revoca da PUBLIC + anon +
--     authenticated? NO — authenticated DEVE mantenere EXECUTE perché la
--     funzione è chiamata dalle policy RLS e dagli edge con user-client).
--
-- ⚠️ APPLICARE VIA STUDIO SQL EDITOR (non `supabase db push`):
--    file multi-comando con CREATE FUNCTION + REVOKE/GRANT → `db push`
--    fallisce con SQLSTATE 42601. Dopo l'apply, registrare la migration in
--    supabase_migrations.schema_migrations. Vedi docs/patterns/storage-sql.md.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.has_permission(
  p_permission_id text,
  p_activity_id   uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN (
  WITH permission_info AS (
    SELECT scope FROM public.permissions WHERE id = p_permission_id
  )
  SELECT
    -- BRANCH 1: owner del tenant che possiede il permesso.
    -- FIX: correlato al tenant proprietario di p_activity_id (se valorizzato).
    EXISTS (
      SELECT 1
      FROM public.tenants t
      WHERE t.owner_user_id = auth.uid()
        AND t.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM public.role_permissions rp
          WHERE rp.role = 'owner' AND rp.permission_id = p_permission_id
        )
        AND (
          p_activity_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.activities a
            WHERE a.id = p_activity_id AND a.tenant_id = t.id
          )
        )
    )
    OR
    -- BRANCH 2: admin del tenant che possiede il permesso.
    -- FIX: correlato al tenant proprietario di p_activity_id (se valorizzato).
    EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      JOIN public.tenants t ON t.id = tm.tenant_id
      WHERE tm.user_id  = auth.uid()
        AND tm.status   = 'active'
        AND tm.role     = 'admin'
        AND t.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM public.role_permissions rp
          WHERE rp.role = 'admin' AND rp.permission_id = p_permission_id
        )
        AND (
          p_activity_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.activities a
            WHERE a.id = p_activity_id AND a.tenant_id = t.id
          )
        )
    )
    OR
    -- BRANCH 3: ruolo activity-scoped che possiede un permesso tenant-scoped
    -- via role_permissions seed. Solo per scope = 'tenant'. Filtra
    -- tenants.deleted_at. NON toccato dal fix.
    EXISTS (
      SELECT 1
      FROM permission_info pi
      JOIN public.tenant_membership_activities tma ON pi.scope = 'tenant'
      JOIN public.tenant_memberships tm ON tm.id = tma.tenant_membership_id
      JOIN public.tenants               t   ON t.id = tma.tenant_id
      JOIN public.role_permissions      rp  ON rp.role = tma.role
      WHERE tm.user_id       = auth.uid()
        AND tm.status        = 'active'
        AND t.deleted_at     IS NULL
        AND rp.permission_id = p_permission_id
    )
    OR
    -- BRANCH 4: ruolo activity-scoped che possiede un permesso activity-scoped
    -- sulla p_activity_id specifica. Già correttamente correlato. NON toccato.
    EXISTS (
      SELECT 1
      FROM permission_info pi
      JOIN public.tenant_membership_activities tma ON pi.scope = 'activity'
                                                  AND tma.activity_id = p_activity_id
      JOIN public.tenant_memberships tm ON tm.id = tma.tenant_membership_id
      JOIN public.tenants               t  ON t.id = tma.tenant_id
      JOIN public.role_permissions      rp ON rp.role = tma.role
      WHERE p_activity_id IS NOT NULL
        AND tm.user_id       = auth.uid()
        AND tm.status        = 'active'
        AND t.deleted_at     IS NULL
        AND rp.permission_id = p_permission_id
    )
  );
END;
$$;

COMMENT ON FUNCTION public.has_permission(text, uuid) IS
  'Verifica se l''utente corrente ha un permesso atomico. '
  '4 branch: (1) owner del tenant, (2) admin del tenant, '
  '(3) ruolo activity-scoped con permesso tenant-scoped via role_permissions, '
  '(4) ruolo activity-scoped con permesso activity-scoped sulla p_activity_id. '
  'SECURITY FIX 2026-07-07: i branch 1 e 2 sono correlati al tenant '
  'proprietario di p_activity_id (quando valorizzato) per impedire grant '
  'cross-tenant a owner/admin. Con p_activity_id NULL il comportamento '
  'resta owner/admin del proprio tenant.';

-- ACL: allineato allo stato live (anon revocato in 20260528210000). Ri-emesso
-- per idempotenza. authenticated MANTIENE EXECUTE (chiamata da RLS + edge).
REVOKE EXECUTE ON FUNCTION public.has_permission(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_permission(text, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.has_permission(text, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_permission(text, uuid) TO service_role;
