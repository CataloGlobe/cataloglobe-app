-- =============================================================================
-- CRM interno, costi: carte e conti, cambi di prezzo e di conto, rimborsi
-- (piano approvato da Alex il 2026-10-16)
-- =============================================================================
-- Tre buchi della prima versione:
--   1. cambiare l'importo di un abbonamento riscriveva anche i mesi passati;
--   2. un rimborso non si poteva segnare (importo minimo 0,01 €);
--   3. non si sapeva su quale carta o conto stava una spesa.
--
-- crm_expense_accounts  carte e conti, con nomi generici: di una persona
--                       (owner_member_id) o comuni (cassa comune, metà a testa)
-- crm_expense_terms     «Cambia da…»: da una data, un abbonamento costa un altro
--                       importo e/o passa su un altro conto. I mesi prima non
--                       cambiano. crm_expenses.amount_cents resta il prezzo dal
--                       primo addebito, crm_expenses.account_id il conto.
-- crm_expense_refunds   rimborsi del fornitore, legati alla spesa di partenza;
--                       importo positivo, si mostra e si conta in negativo.
--
-- Le due funzioni degli addebiti sono riscritte partendo da pg_get_functiondef
-- su staging (2026-10-16), con la stessa firma: cambia solo da dove prendono
-- l'importo. I privilegi sono in 120100 (CREATE FUNCTION e GRANT nello stesso
-- file fanno fallire db push, 42601).
--
-- Schema e funzioni stanno nello stesso file così non si applicano a metà:
-- crm_expense_charges legge crm_expense_terms.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- crm_expense_accounts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_expense_accounts (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Nome generico («Postepay Alex», «Revolut cointestato»): mai numeri di
    -- carta o di conto, per questo niente 8 cifre di fila.
    name             text NOT NULL
                     CHECK (char_length(btrim(name)) BETWEEN 1 AND 60)
                     CHECK (name !~ '[0-9]{8,}'),
    kind             text NOT NULL CHECK (kind IN ('personal', 'joint')),
    -- crm_team_members ha come chiave user_id (non id).
    owner_member_id  uuid REFERENCES public.crm_team_members(user_id) ON DELETE RESTRICT,
    closed_on        date,
    created_by       uuid DEFAULT auth.uid(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT crm_expense_accounts_owner CHECK (
        (kind = 'personal' AND owner_member_id IS NOT NULL)
        OR (kind = 'joint' AND owner_member_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_expense_accounts_name_key
    ON public.crm_expense_accounts (lower(btrim(name)));
CREATE INDEX IF NOT EXISTS crm_expense_accounts_owner_idx
    ON public.crm_expense_accounts (owner_member_id);

COMMENT ON TABLE public.crm_expense_accounts IS
    'Carte e conti delle spese (/admin/costi), con nomi generici: di una persona o comuni (metà a testa).';

DROP TRIGGER IF EXISTS crm_expense_accounts_set_updated_at ON public.crm_expense_accounts;
CREATE TRIGGER crm_expense_accounts_set_updated_at
    BEFORE UPDATE ON public.crm_expense_accounts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.crm_expense_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_expense_accounts select" ON public.crm_expense_accounts;
CREATE POLICY "crm_expense_accounts select" ON public.crm_expense_accounts
    FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_expense_accounts insert" ON public.crm_expense_accounts;
CREATE POLICY "crm_expense_accounts insert" ON public.crm_expense_accounts
    FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_expense_accounts update" ON public.crm_expense_accounts;
CREATE POLICY "crm_expense_accounts update" ON public.crm_expense_accounts
    FOR UPDATE TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_expense_accounts delete" ON public.crm_expense_accounts;
CREATE POLICY "crm_expense_accounts delete" ON public.crm_expense_accounts
    FOR DELETE TO authenticated USING (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- Colonne nuove sulle tabelle dei costi (vuote: le righe vecchie restano col
-- solo paid_by / to_name, che il codice continua a leggere)
-- -----------------------------------------------------------------------------
ALTER TABLE public.crm_expenses
    ADD COLUMN IF NOT EXISTS account_id uuid
        REFERENCES public.crm_expense_accounts(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS crm_expenses_account_idx
    ON public.crm_expenses (account_id);

ALTER TABLE public.crm_expense_settlements
    ADD COLUMN IF NOT EXISTS account_id uuid
        REFERENCES public.crm_expense_accounts(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS crm_expense_settlements_account_idx
    ON public.crm_expense_settlements (account_id);

-- -----------------------------------------------------------------------------
-- crm_expense_terms
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_expense_terms (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id    uuid NOT NULL REFERENCES public.crm_expenses(id) ON DELETE CASCADE,
    -- Vale dall'addebito con data uguale o successiva.
    valid_from    date NOT NULL,
    amount_cents  integer NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 10000000),
    -- Vuoto: resta il conto di prima.
    account_id    uuid REFERENCES public.crm_expense_accounts(id) ON DELETE RESTRICT,
    created_by    uuid DEFAULT auth.uid(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT crm_expense_terms_once_per_day UNIQUE (expense_id, valid_from)
);

CREATE INDEX IF NOT EXISTS crm_expense_terms_account_idx
    ON public.crm_expense_terms (account_id);

COMMENT ON TABLE public.crm_expense_terms IS
    'Cambi di prezzo e di conto di un abbonamento da una data: i mesi prima non cambiano.';

-- Solo abbonamenti, e dopo il primo addebito (prima il prezzo è amount_cents).
CREATE OR REPLACE FUNCTION public.crm_expense_terms_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
    v_kind  text;
    v_first date;
BEGIN
    SELECT e.kind, e.first_charge_on INTO v_kind, v_first
    FROM public.crm_expenses e
    WHERE e.id = NEW.expense_id;

    IF v_kind IS DISTINCT FROM 'subscription' THEN
        RAISE EXCEPTION 'term_not_subscription' USING ERRCODE = '22023';
    END IF;
    IF NEW.valid_from <= v_first THEN
        RAISE EXCEPTION 'term_before_first_charge' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_expense_terms_check ON public.crm_expense_terms;
CREATE TRIGGER crm_expense_terms_check
    BEFORE INSERT OR UPDATE ON public.crm_expense_terms
    FOR EACH ROW EXECUTE FUNCTION public.crm_expense_terms_check();

-- Niente UPDATE: un cambio sbagliato si toglie e si rifà.
ALTER TABLE public.crm_expense_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_expense_terms select" ON public.crm_expense_terms;
CREATE POLICY "crm_expense_terms select" ON public.crm_expense_terms
    FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_expense_terms insert" ON public.crm_expense_terms;
CREATE POLICY "crm_expense_terms insert" ON public.crm_expense_terms
    FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_expense_terms delete" ON public.crm_expense_terms;
CREATE POLICY "crm_expense_terms delete" ON public.crm_expense_terms
    FOR DELETE TO authenticated USING (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- crm_expense_refunds
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_expense_refunds (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id    uuid NOT NULL REFERENCES public.crm_expenses(id) ON DELETE CASCADE,
    refunded_on   date NOT NULL,
    -- Positivo: è quanto è rientrato; la pagina lo mostra e lo conta in negativo.
    amount_cents  integer NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 10000000),
    note          text CHECK (note IS NULL OR char_length(note) <= 300),
    created_by    uuid DEFAULT auth.uid(),
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_expense_refunds_expense_idx
    ON public.crm_expense_refunds (expense_id);

COMMENT ON TABLE public.crm_expense_refunds IS
    'Rimborsi dei fornitori, legati alla spesa di partenza; contano in negativo.';

ALTER TABLE public.crm_expense_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_expense_refunds select" ON public.crm_expense_refunds;
CREATE POLICY "crm_expense_refunds select" ON public.crm_expense_refunds
    FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_expense_refunds insert" ON public.crm_expense_refunds;
CREATE POLICY "crm_expense_refunds insert" ON public.crm_expense_refunds
    FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_expense_refunds delete" ON public.crm_expense_refunds;
CREATE POLICY "crm_expense_refunds delete" ON public.crm_expense_refunds
    FOR DELETE TO authenticated USING (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- crm_expense_charges: stessa firma; per gli abbonamenti l'importo è quello
-- dell'ultimo term con valid_from <= charged_on, altrimenti amount_cents.
-- Un term conta solo se è dopo il primo addebito: il trigger lo garantisce
-- all'inserimento, il filtro qui anche se poi first_charge_on si sposta
-- (updateCrmExpense riscrive la riga). Il primo addebito è sempre amount_cents.
-- Le una tantum restano come prima. Le date non cambiano.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_expense_charges(p_until date)
 RETURNS TABLE(r_expense_id uuid, r_charged_on date, r_amount_cents integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
    SELECT e.id, e.paid_on, e.amount_cents
    FROM public.crm_expenses e
    WHERE e.kind = 'one_off'
      AND e.paid_on <= p_until
    UNION ALL
    SELECT e.id, c.charged_on,
           COALESCE(
               (SELECT t.amount_cents
                FROM public.crm_expense_terms t
                WHERE t.expense_id = e.id
                  AND t.valid_from <= c.charged_on
                  AND t.valid_from > e.first_charge_on
                ORDER BY t.valid_from DESC
                LIMIT 1),
               e.amount_cents
           )
    FROM public.crm_expenses e
    CROSS JOIN LATERAL (
        SELECT (e.first_charge_on
                + make_interval(months => n.i * CASE WHEN e.billing_interval = 'year' THEN 12 ELSE 1 END)
               )::date AS charged_on
        FROM generate_series(
            0,
            GREATEST(
                0,
                (
                    (extract(year FROM p_until)::int - extract(year FROM e.first_charge_on)::int) * 12
                    + extract(month FROM p_until)::int - extract(month FROM e.first_charge_on)::int
                ) / CASE WHEN e.billing_interval = 'year' THEN 12 ELSE 1 END
            )
        ) AS n(i)
    ) c
    WHERE e.kind = 'subscription'
      AND c.charged_on <= p_until
      AND (e.cancelled_on IS NULL OR c.charged_on < e.cancelled_on);
$function$;

-- -----------------------------------------------------------------------------
-- crm_expense_renewals_due: stessa firma; l'importo del promemoria è quello
-- valido al prossimo addebito (prima diceva il prezzo del primo).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_expense_renewals_due(p_today date DEFAULT ((now() AT TIME ZONE 'Europe/Rome'::text))::date)
 RETURNS TABLE(r_expense_id uuid, r_name text, r_amount_cents integer, r_billing_interval text, r_next_charge_on date, r_paid_by text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
    SELECT e.id, e.name,
           COALESCE(
               (SELECT t.amount_cents
                FROM public.crm_expense_terms t
                WHERE t.expense_id = e.id
                  AND t.valid_from <= n.r_next_charge_on
                  AND t.valid_from > e.first_charge_on
                ORDER BY t.valid_from DESC
                LIMIT 1),
               e.amount_cents
           ),
           e.billing_interval, n.r_next_charge_on, e.paid_by
    FROM public.crm_expense_next_charges(p_today) n
    JOIN public.crm_expenses e ON e.id = n.r_expense_id
    WHERE e.remind_days_before IS NOT NULL
      AND n.r_next_charge_on <= p_today + e.remind_days_before
      AND e.reminded_for IS DISTINCT FROM n.r_next_charge_on
    ORDER BY n.r_next_charge_on, e.name;
$function$;
