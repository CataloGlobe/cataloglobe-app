-- ============================================================================
-- platform_admins — allowlist degli admin di PIATTAFORMA (i fondatori).
-- ============================================================================
--
-- SENZA `tenant_id` PER DESIGN.
-- Eccezione dichiarata alla regola generale "ogni tabella e' tenant-scoped",
-- allo stesso titolo di `allergens`: questo e' un dato di piattaforma, non
-- appartiene a nessun tenant e non e' raggiungibile da `get_my_tenant_ids()`.
-- Il modello di autorizzazione e' completamente separato dai 5 ruoli
-- tenant-scoped (owner / admin / manager / staff / viewer).
--
-- Sostituisce l'allowlist via env var scalare (`ADMIN_EMAIL` server-side,
-- `VITE_ADMIN_EMAIL` client-side), che ammetteva un solo utente.
--
-- ── Ordine delle migration (dipendenza circolare) ───────────────────────────
-- La policy SELECT di questa tabella richiede `public.is_platform_admin()`,
-- e quella funzione legge questa tabella. Con `check_function_bodies` attivo
-- il body SQL viene validato alla CREATE FUNCTION, quindi nessuno dei due
-- oggetti puo' nascere per primo con tutte le sue dipendenze risolte.
-- Sequenza adottata:
--   1. 20260826100000 (questo file)  tabella + RLS + policy di DENY sulle write
--   2. 20260826100001                CREATE FUNCTION is_platform_admin()
--   3. 20260826100002                REVOKE/GRANT sulla funzione
--   4. 20260826100003                policy SELECT su questa tabella
-- Fino all'applicazione del file 4 la tabella e' in deny-all per
-- `authenticated`: RLS attiva senza alcuna policy SELECT. Fail-closed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_admins (
    user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- ON DELETE SET NULL, non il NO ACTION di default: con NO ACTION la
    -- cancellazione di un utente che ha concesso un accesso admin verrebbe
    -- bloccata dalla FK. Il progetto ha flussi di eliminazione account attivi
    -- (`delete-account`, `purge-accounts` + cron notturno `purge_accounts_daily`)
    -- → sarebbe un fallimento silenzioso dentro un job schedulato.
    -- Perdere l'attribuzione e' accettabile; bloccare una cancellazione no.
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    note       text
);

COMMENT ON TABLE public.platform_admins IS
    'Allowlist admin di piattaforma. Senza tenant_id per design (dato non tenant-scoped, come allergens). Gestita solo via SQL manuale con service_role: nessuna UI, nessuna write da PostgREST.';
COMMENT ON COLUMN public.platform_admins.created_by IS
    'Chi ha concesso l''accesso. NULL per le righe di seed iniziale (nessun admin preesistente che potesse concederlo) e per gli utenti concedenti cancellati (ON DELETE SET NULL).';
COMMENT ON COLUMN public.platform_admins.note IS
    'Chi e'' / perche''. Solo leggibilita'' umana, nessun uso applicativo.';

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- ── Write: negate ESPLICITAMENTE, non omesse ────────────────────────────────
-- Stesso pattern di `schedule_targets` (20260528120000): una policy con
-- qual/with_check `false` documenta l'intenzione nel catalogo, mentre
-- l'assenza di policy e' indistinguibile da una dimenticanza.
--
-- Motivazione: in questa fase NON esiste alcuna UI di gestione admin, per
-- scelta. Concedere o revocare un admin di piattaforma e' un'operazione rara,
-- ad alto impatto e volutamente scomoda: si fa a mano in SQL con `service_role`
-- (che bypassa RLS e quindi queste policy).

DROP POLICY IF EXISTS "No direct INSERT on platform_admins" ON public.platform_admins;
CREATE POLICY "No direct INSERT on platform_admins"
    ON public.platform_admins
    FOR INSERT
    TO authenticated
    WITH CHECK (false);

DROP POLICY IF EXISTS "No direct UPDATE on platform_admins" ON public.platform_admins;
CREATE POLICY "No direct UPDATE on platform_admins"
    ON public.platform_admins
    FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

DROP POLICY IF EXISTS "No direct DELETE on platform_admins" ON public.platform_admins;
CREATE POLICY "No direct DELETE on platform_admins"
    ON public.platform_admins
    FOR DELETE
    TO authenticated
    USING (false);

-- La policy SELECT vive in 20260826100003, dopo la CREATE FUNCTION.
