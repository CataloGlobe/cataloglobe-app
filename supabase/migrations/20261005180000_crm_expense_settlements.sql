-- =============================================================================
-- CRM interno: costi, chi ha pagato cosa (decisione di Alex del 2026-10-05)
-- =============================================================================
-- Fin qui Alex e Lorenzo hanno pagato le spese ognuno per conto suo, per poi
-- dividerle; presto ci sarà un conto comune. La pagina /admin/costi fa il conto
-- da sola dagli addebiti (`crm_expenses.paid_by`); qui si salvano solo i
-- movimenti di soldi tra le persone, che il calcolo non può sapere:
--   * un rimborso: da una persona all'altra («Lorenzo dà 120 € ad Alex»);
--   * un versamento sul conto comune: `to_name` = 'Conto comune'.
-- Le spese pagate dal conto comune non pesano su nessuno; i versamenti sul
-- conto contano come spese pagate da chi versa. Il calcolo è in
-- src/utils/crm/expenseBalance.ts.
--
-- Tabella di piattaforma come le altre `crm_*`: niente tenant_id, RLS su
-- `is_platform_admin()`. Niente UPDATE: un movimento sbagliato si toglie e si
-- rifà. Tabella nuova, nessun oggetto esistente toccato.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.crm_expense_settlements (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_name     text NOT NULL CHECK (char_length(btrim(from_name)) BETWEEN 1 AND 60),
    to_name       text NOT NULL CHECK (char_length(btrim(to_name)) BETWEEN 1 AND 60),
    amount_cents  integer NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 10000000),
    settled_on    date NOT NULL,
    note          text CHECK (note IS NULL OR char_length(note) <= 300),
    created_by    uuid DEFAULT auth.uid(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT crm_expense_settlements_two_people
        CHECK (lower(btrim(from_name)) <> lower(btrim(to_name)))
);

COMMENT ON TABLE public.crm_expense_settlements IS
    'Rimborsi tra le persone e versamenti sul conto comune (/admin/costi, chi ha pagato cosa).';

CREATE INDEX IF NOT EXISTS crm_expense_settlements_settled_on_idx
    ON public.crm_expense_settlements (settled_on DESC);

-- -----------------------------------------------------------------------------
-- Privilegi: niente ad anon; authenticated passa comunque dalle policy.
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.crm_expense_settlements FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.crm_expense_settlements TO authenticated;

-- -----------------------------------------------------------------------------
-- RLS: solo admin di piattaforma
-- -----------------------------------------------------------------------------
ALTER TABLE public.crm_expense_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_expense_settlements select" ON public.crm_expense_settlements;
CREATE POLICY "crm_expense_settlements select" ON public.crm_expense_settlements
    FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_expense_settlements insert" ON public.crm_expense_settlements;
CREATE POLICY "crm_expense_settlements insert" ON public.crm_expense_settlements
    FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_expense_settlements delete" ON public.crm_expense_settlements;
CREATE POLICY "crm_expense_settlements delete" ON public.crm_expense_settlements
    FOR DELETE TO authenticated USING (public.is_platform_admin());
