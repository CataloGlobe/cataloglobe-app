-- Avvisi dell'advisor (giro Supabase Pro del 2026-10-08, sezione 5, punti 2 e 4).
-- Definizioni lette da pg_policies su staging il 2026-10-09: nessuna regola
-- cambia, cambia solo come si scrivono.
--
-- 1. auth_rls_initplan: auth.uid() / auth.email() avvolti in (select ...),
--    così Postgres li calcola una volta per query invece che per riga.
--    ALTER POLICY tiene comando, ruoli e permissive/restrictive.
-- 2. multiple_permissive_policies: tolte solo le due policy identiche a
--    un'altra (plans, product_allergens). Le altre 5 tabelle hanno policy
--    diverse tra loro: unirle cambia la logica, resta da decidere.
-- 3. duplicate_index: tolti i due doppioni che non reggono vincoli.
-- 4. Funzioni SECURITY DEFINER eseguibili da anon: get_user_tenants (non
--    chiamata da nessuno senza login; aveva EXECUTE anche a PUBLIC) e
--    accept/decline_invite_by_token (rifiutano già anon dentro, l'app le
--    chiama solo dopo il login). get_public_tenant_ids NON si tocca: la usano
--    11 policy «Public can read ...» della pagina pubblica.
--
-- Se in produzione una policy ha un nome diverso, ALTER POLICY fallisce e
-- la migration si annulla tutta: va bene così, si guarda prima di riprovare.

-- ── 1. auth_rls_initplan ────────────────────────────────────────────────

-- profiles
ALTER POLICY profiles_insert_owner ON public.profiles
    WITH CHECK (id = (select auth.uid()));

ALTER POLICY profiles_select_self_or_tenant_member ON public.profiles
    USING (
        (id = (select auth.uid()))
        OR EXISTS (
            SELECT 1
            FROM public.tenant_memberships tm_self
            JOIN public.tenant_memberships tm_target ON tm_target.tenant_id = tm_self.tenant_id
            WHERE tm_self.user_id = (select auth.uid())
              AND tm_target.user_id = profiles.id
              AND tm_self.status = 'active'
              AND tm_target.status = 'active'
        )
    );

ALTER POLICY profiles_update_owner ON public.profiles
    USING (id = (select auth.uid()))
    WITH CHECK (id = (select auth.uid()));

-- tenants
ALTER POLICY "Tenant can insert own tenants" ON public.tenants
    WITH CHECK (owner_user_id = (select auth.uid()));

ALTER POLICY "Tenant can update own tenants" ON public.tenants
    USING (owner_user_id = (select auth.uid()))
    WITH CHECK (owner_user_id = (select auth.uid()));

ALTER POLICY "Users can read their tenants" ON public.tenants
    USING (
        ((owner_user_id = (select auth.uid())) AND (deleted_at IS NULL))
        OR (id IN (SELECT public.get_my_tenant_ids()))
    );

-- tenant_memberships
ALTER POLICY "Tenant owner can manage memberships" ON public.tenant_memberships
    USING (
        EXISTS (
            SELECT 1 FROM public.tenants t
            WHERE t.id = tenant_memberships.tenant_id
              AND t.owner_user_id = (select auth.uid())
              AND t.deleted_at IS NULL
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenants t
            WHERE t.id = tenant_memberships.tenant_id
              AND t.owner_user_id = (select auth.uid())
              AND t.deleted_at IS NULL
        )
    );

ALTER POLICY "Active members can read memberships" ON public.tenant_memberships
    USING (
        EXISTS (
            SELECT 1 FROM public.tenants t
            WHERE t.id = tenant_memberships.tenant_id
              AND t.owner_user_id = (select auth.uid())
        )
    );

ALTER POLICY "Users can read own memberships or invites" ON public.tenant_memberships
    USING ((user_id = (select auth.uid())) OR (invited_email = (select auth.email())));

ALTER POLICY "Users can read pending invites for their email" ON public.tenant_memberships
    USING (lower(invited_email) = lower((select auth.email())));

ALTER POLICY "Users can read their own membership" ON public.tenant_memberships
    USING (user_id = (select auth.uid()));

ALTER POLICY "Users can read their own pending email invites" ON public.tenant_memberships
    USING ((status = 'pending') AND (lower(invited_email) = lower((select auth.email()))));

-- audit_logs
ALTER POLICY "User can read own orphan audit logs" ON public.audit_logs
    USING ((tenant_id IS NULL) AND (user_id = (select auth.uid())));

-- notifications
ALTER POLICY "Users can delete own notifications" ON public.notifications
    USING (user_id = (select auth.uid()));

ALTER POLICY "Users can mark own notifications as read" ON public.notifications
    USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "Users can read own notifications" ON public.notifications
    USING (user_id = (select auth.uid()));

-- consent_records
ALTER POLICY "Users can insert own consents" ON public.consent_records
    WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "Users can view own consents" ON public.consent_records
    USING (user_id = (select auth.uid()));

-- otp_user_verifications
ALTER POLICY otp_user_verifications_select_owner ON public.otp_user_verifications
    USING (user_id = (select auth.uid()));

-- support_tickets
ALTER POLICY "Roles can insert support_tickets" ON public.support_tickets
    WITH CHECK (
        (tenant_id IN (SELECT public.get_my_tenant_ids()))
        AND public.has_permission_any_activity('support.write', tenant_id)
        AND (created_by = (select auth.uid()))
        AND (status = 'open')
        AND (closed_at IS NULL)
        AND (
            (activity_id IS NULL)
            OR EXISTS (
                SELECT 1 FROM public.activities a
                WHERE a.id = support_tickets.activity_id
                  AND a.tenant_id = support_tickets.tenant_id
            )
        )
    );

-- support_messages
ALTER POLICY "Customers can insert support_messages" ON public.support_messages
    WITH CHECK (
        (author_kind = 'customer')
        AND (author_user_id = (select auth.uid()))
        AND EXISTS (
            SELECT 1 FROM public.support_tickets t
            WHERE t.id = support_messages.ticket_id
              AND t.tenant_id IN (SELECT public.get_my_tenant_ids())
              AND public.has_permission_any_activity('support.write', t.tenant_id)
        )
    );

ALTER POLICY "Platform admins can insert support_messages" ON public.support_messages
    WITH CHECK (
        (author_kind = 'platform')
        AND (author_user_id = (select auth.uid()))
        AND public.is_platform_admin()
    );

-- ── 2. Policy identiche a un'altra ──────────────────────────────────────
-- plans: entrambe SELECT, authenticated, USING (true).
DROP POLICY IF EXISTS "Authenticated users can read plans" ON public.plans;
-- product_allergens: entrambe SELECT, USING (tenant_id IN get_my_tenant_ids()).
DROP POLICY IF EXISTS "Tenants can select their own product allergens" ON public.product_allergens;

-- ── 3. Indici doppi ─────────────────────────────────────────────────────
-- otp_challenges_user_idx resta (stessa colonna, stesso tipo).
DROP INDEX IF EXISTS public.otp_challenges_user_id_idx;
-- Resta schedule_targets_schedule_target_unique, che regge il vincolo omonimo.
DROP INDEX IF EXISTS public.v2_schedule_targets_unique_idx;

-- ── 4. Funzioni non per anon ────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.get_user_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_tenants() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.accept_invite_by_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite_by_token(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.decline_invite_by_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_invite_by_token(uuid) TO authenticated, service_role;
