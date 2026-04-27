-- =============================================================================
-- Security Advisor fixes — risolve 4 dei 6 errori del Supabase Security Advisor.
-- =============================================================================
--
-- Errori fixati (4):
--   1. rls_disabled_in_public          → public.plans                 (STEP 1)
--   2. security_definer_view           → public.user_tenants_view     (STEP 2)
--   3. preparazione sostituto RPC      → tenant_members_view          (STEP 3)
--   4. preparazione sostituto RPC      → my_pending_invites_view      (STEP 4)
--
-- Errori NON fixati in questa migration (2):
--   - auth_users_exposed → tenant_members_view
--   - auth_users_exposed → my_pending_invites_view
--
-- Le due view restano in piedi perché ancora chiamate dal frontend
-- (TeamPage Workspace/Business + WorkspacePage). Verranno droppate in una
-- migration successiva, dopo il refactor del frontend per consumare le RPC
-- get_tenant_members(uuid) e get_my_pending_invites() introdotte qui.
--
-- Nessuna modifica a get_my_tenant_ids() / get_user_tenants() (regola CLAUDE.md).
-- =============================================================================


BEGIN;


-- =============================================================================
-- STEP 1 — public.plans: enable RLS + policy SELECT authenticated
-- =============================================================================
--
-- La tabella plans è una lookup di configurazione (codice piano + limiti).
-- Frontend non la legge (verificato via grep src/). Esposta solo a authenticated
-- per uso futuro (es. badge limiti UI). anon non ha bisogno di leggerla.
-- INSERT/UPDATE/DELETE rimangono service_role-only (lifecycle gestito da
-- Stripe webhook / admin tooling).

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read plans"
  ON public.plans
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.plans FROM anon;


-- =============================================================================
-- STEP 2 — public.user_tenants_view: security_invoker = true
-- =============================================================================
--
-- La view delega a get_user_tenants() (SECURITY DEFINER) che applica già il
-- filtro user-scoped via auth.uid(). Aggiungere security_invoker=true rende
-- la view conforme al lint security_definer_view senza alterare il
-- comportamento runtime: i privilegi di chi interroga la view restano quelli
-- del caller, mentre la funzione delegata continua a girare con i privilegi
-- dell'owner per leggere tenants/tenant_memberships.

DROP VIEW IF EXISTS public.user_tenants_view;

CREATE VIEW public.user_tenants_view
WITH (security_invoker = true) AS
SELECT
    id,
    name,
    vertical_type,
    business_subtype,
    created_at,
    owner_user_id,
    user_role,
    logo_url,
    plan,
    subscription_status,
    trial_until,
    stripe_customer_id,
    stripe_subscription_id,
    paid_seats
FROM public.get_user_tenants();

GRANT SELECT ON public.user_tenants_view TO authenticated;


-- =============================================================================
-- STEP 3 — public.get_tenant_members(p_tenant_id uuid)
-- =============================================================================
--
-- RPC che sostituirà la lettura diretta di tenant_members_view dal frontend.
-- Espone le 11 colonne complete (superset dei call site attuali in
-- Workspace/TeamPage e Business/TeamPage). Filtro di accesso: caller deve
-- essere owner del tenant OR membro attivo (get_my_tenant_ids).

CREATE OR REPLACE FUNCTION public.get_tenant_members(p_tenant_id uuid)
RETURNS TABLE(
    membership_id uuid,
    tenant_id uuid,
    user_id uuid,
    email text,
    role text,
    status text,
    invited_by uuid,
    inviter_email text,
    invite_token uuid,
    invite_expires_at timestamptz,
    created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
    SELECT
        tm.id AS membership_id,
        tm.tenant_id,
        tm.user_id,
        COALESCE(u.email, tm.invited_email)::text AS email,
        tm.role,
        tm.status,
        tm.invited_by,
        inviter.email::text AS inviter_email,
        tm.invite_token,
        tm.invite_expires_at,
        tm.created_at
    FROM public.tenant_memberships tm
    LEFT JOIN auth.users u       ON u.id       = tm.user_id
    LEFT JOIN auth.users inviter ON inviter.id = tm.invited_by
    WHERE tm.tenant_id = p_tenant_id
      AND (
          -- Caller è owner del tenant
          EXISTS (
              SELECT 1
              FROM public.tenants t
              WHERE t.id = p_tenant_id
                AND t.owner_user_id = auth.uid()
                AND t.deleted_at IS NULL
          )
          -- Oppure caller è membro attivo del tenant
          OR p_tenant_id IN (SELECT public.get_my_tenant_ids())
      )
    ORDER BY tm.created_at ASC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_tenant_members(uuid) TO authenticated;


-- =============================================================================
-- STEP 4 — public.get_my_pending_invites()
-- =============================================================================
--
-- RPC che sostituirà la lettura diretta di my_pending_invites_view dal
-- frontend. Replica la logica della view: pending invites destinati al
-- caller (per email o user_id), esclusi gli inviti creati dal caller stesso,
-- esclusi gli scaduti.

CREATE OR REPLACE FUNCTION public.get_my_pending_invites()
RETURNS TABLE(
    membership_id uuid,
    tenant_id uuid,
    invite_token uuid,
    role text,
    status text,
    inviter_email text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
    SELECT
        tm.id AS membership_id,
        tm.tenant_id,
        tm.invite_token,
        tm.role,
        tm.status,
        inviter.email::text AS inviter_email
    FROM public.tenant_memberships tm
    LEFT JOIN auth.users inviter ON inviter.id = tm.invited_by
    WHERE tm.status = 'pending'
      AND tm.invited_by IS DISTINCT FROM auth.uid()
      AND (tm.invite_expires_at IS NULL OR tm.invite_expires_at > now())
      AND (
          lower(tm.invited_email) = lower(auth.email())
          OR tm.user_id = auth.uid()
      );
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_pending_invites() TO authenticated;


-- =============================================================================
-- STEP 5 — Validation
-- =============================================================================

DO $$
BEGIN
    -- RLS attiva su plans
    IF NOT EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname       = 'plans'
          AND relnamespace  = 'public'::regnamespace
          AND relrowsecurity = true
    ) THEN
        RAISE EXCEPTION 'plans table does not have RLS enabled';
    END IF;

    -- Policy SELECT su plans presente
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'plans'
          AND policyname = 'Authenticated users can read plans'
    ) THEN
        RAISE EXCEPTION 'plans policy "Authenticated users can read plans" missing';
    END IF;

    -- security_invoker=true su user_tenants_view
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        WHERE c.relname      = 'user_tenants_view'
          AND c.relnamespace = 'public'::regnamespace
          AND c.reloptions @> ARRAY['security_invoker=true']
    ) THEN
        RAISE EXCEPTION 'user_tenants_view does not have security_invoker=true';
    END IF;

    -- get_tenant_members(uuid) esiste
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname      = 'get_tenant_members'
          AND pronamespace = 'public'::regnamespace
    ) THEN
        RAISE EXCEPTION 'function get_tenant_members(uuid) missing';
    END IF;

    -- get_my_pending_invites() esiste
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname      = 'get_my_pending_invites'
          AND pronamespace = 'public'::regnamespace
    ) THEN
        RAISE EXCEPTION 'function get_my_pending_invites() missing';
    END IF;

    RAISE NOTICE 'Migration security_advisor_fixes applied successfully';
END $$;


COMMIT;
