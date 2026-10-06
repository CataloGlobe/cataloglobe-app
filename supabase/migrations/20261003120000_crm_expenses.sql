-- =============================================================================
-- CRM interno: sezione costi, prima versione a mano (decisione di Alex del
-- 2026-10-02)
-- =============================================================================
-- Spese dell'azienda inserite a mano in /admin/costi: una tantum (pagate in un
-- giorno) e abbonamenti (un addebito ogni mese o anno dalla data del primo).
-- Gli addebiti non si salvano: li calcola `crm_expense_charges` (120100) dalla
-- data del primo e dall'intervallo, così cambiare una data riscrive i totali
-- senza righe da sistemare. Le integrazioni con Qonto, Stripe e Meta arrivano
-- in Fase 3.
--
-- Tabella di piattaforma come le altre `crm_*`: niente tenant_id, RLS su
-- `is_platform_admin()`. Importi in centesimi di euro, IVA inclusa: quello
-- che è uscito dal conto.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.crm_expenses (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind                text NOT NULL CHECK (kind IN ('one_off', 'subscription')),
    name                text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
    category            text NOT NULL DEFAULT 'software'
                        CHECK (category IN ('software', 'advertising', 'services', 'hardware', 'other')),
    amount_cents        integer NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 10000000),
    -- Chi l'ha pagata (per esempio per dividerla su Splitwise). Testo libero.
    paid_by             text CHECK (paid_by IS NULL OR char_length(paid_by) <= 60),
    -- Una tantum: il giorno del pagamento.
    paid_on             date,
    -- Abbonamento: il primo addebito al prezzo indicato, poi uno ogni intervallo.
    first_charge_on     date,
    billing_interval    text CHECK (billing_interval IN ('month', 'year')),
    -- Abbonamento disdetto: niente addebiti da questo giorno in poi.
    cancelled_on        date,
    -- Promemoria su Telegram N giorni prima del rinnovo; NULL = nessuno.
    remind_days_before  smallint DEFAULT 3
                        CHECK (remind_days_before IS NULL OR remind_days_before BETWEEN 0 AND 60),
    -- Data del rinnovo già ricordato: lo scrive crm-notify, evita i doppioni.
    reminded_for        date,
    notes               text CHECK (notes IS NULL OR char_length(notes) <= 1000),
    created_by          uuid DEFAULT auth.uid(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT crm_expenses_shape CHECK (
        (kind = 'one_off'
            AND paid_on IS NOT NULL
            AND first_charge_on IS NULL
            AND billing_interval IS NULL
            AND cancelled_on IS NULL)
        OR
        (kind = 'subscription'
            AND paid_on IS NULL
            AND first_charge_on IS NOT NULL
            AND billing_interval IS NOT NULL)
    )
);

COMMENT ON TABLE public.crm_expenses IS
    'Spese dell''azienda inserite a mano (/admin/costi): una tantum e abbonamenti. Gli addebiti li calcola crm_expense_charges.';

-- Funzione esistente, solo usata (non modificata): NEW.updated_at = now().
DROP TRIGGER IF EXISTS crm_expenses_set_updated_at ON public.crm_expenses;
CREATE TRIGGER crm_expenses_set_updated_at
    BEFORE UPDATE ON public.crm_expenses
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Privilegi: niente ad anon; authenticated passa comunque dalle policy.
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.crm_expenses FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crm_expenses TO authenticated;

-- -----------------------------------------------------------------------------
-- RLS: solo admin di piattaforma
-- -----------------------------------------------------------------------------
ALTER TABLE public.crm_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_expenses select" ON public.crm_expenses;
CREATE POLICY "crm_expenses select" ON public.crm_expenses
    FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_expenses insert" ON public.crm_expenses;
CREATE POLICY "crm_expenses insert" ON public.crm_expenses
    FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_expenses update" ON public.crm_expenses;
CREATE POLICY "crm_expenses update" ON public.crm_expenses
    FOR UPDATE TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_expenses delete" ON public.crm_expenses;
CREATE POLICY "crm_expenses delete" ON public.crm_expenses
    FOR DELETE TO authenticated USING (public.is_platform_admin());
