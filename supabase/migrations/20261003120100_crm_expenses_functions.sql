-- =============================================================================
-- CRM interno: sezione costi, funzioni (GRANT in 20261003120200)
-- =============================================================================
-- Una regola sola per gli addebiti, letta da /admin/costi, dal promemoria dei
-- rinnovi (crm-notify) e dal suo cron (20261003120300):
--   * una tantum: un addebito il giorno del pagamento;
--   * abbonamento: il primo addebito, poi uno ogni mese (o anno) contato dal
--     primo, mai dal precedente: il 31 gennaio diventa 28 febbraio e poi di
--     nuovo 31 marzo (aritmetica di `date + interval` di Postgres);
--   * abbonamento disdetto: niente addebiti dal giorno della disdetta in poi.
-- Il giorno di oggi è quello di Roma.
-- Tutte SECURITY INVOKER: chi chiama passa dalle policy di crm_expenses.
-- =============================================================================

-- Addebiti fino a p_until compreso.
CREATE OR REPLACE FUNCTION public.crm_expense_charges(p_until date)
RETURNS TABLE (r_expense_id uuid, r_charged_on date, r_amount_cents integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT e.id, e.paid_on, e.amount_cents
    FROM public.crm_expenses e
    WHERE e.kind = 'one_off'
      AND e.paid_on <= p_until
    UNION ALL
    SELECT e.id, c.charged_on, e.amount_cents
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
$$;

COMMENT ON FUNCTION public.crm_expense_charges(date) IS
    'Addebiti delle spese del CRM fino a p_until compreso: una tantum al giorno del pagamento, abbonamenti a ogni mese o anno dal primo addebito, fino alla disdetta esclusa.';

-- Prossimo addebito di ogni abbonamento non disdetto prima di allora: il primo
-- da oggi in poi (oggi compreso). Un abbonamento che ha già finito non c'è.
CREATE OR REPLACE FUNCTION public.crm_expense_next_charges(
    p_today date DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date
)
RETURNS TABLE (r_expense_id uuid, r_next_charge_on date)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT c.r_expense_id, min(c.r_charged_on)
    FROM public.crm_expense_charges(p_today + 400) c
    JOIN public.crm_expenses e ON e.id = c.r_expense_id
    WHERE e.kind = 'subscription'
      AND c.r_charged_on >= p_today
    GROUP BY c.r_expense_id;
$$;

COMMENT ON FUNCTION public.crm_expense_next_charges(date) IS
    'Prossimo addebito (da p_today compreso) di ogni abbonamento del CRM ancora attivo a quella data.';

-- Rinnovi da ricordare oggi: prossimo addebito entro remind_days_before giorni
-- e non ancora ricordato. Chi ha saltato un giorno (cron fermo) viene ricordato
-- il giorno dopo, finché il rinnovo non è passato.
CREATE OR REPLACE FUNCTION public.crm_expense_renewals_due(
    p_today date DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date
)
RETURNS TABLE (
    r_expense_id uuid,
    r_name text,
    r_amount_cents integer,
    r_billing_interval text,
    r_next_charge_on date,
    r_paid_by text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT e.id, e.name, e.amount_cents, e.billing_interval, n.r_next_charge_on, e.paid_by
    FROM public.crm_expense_next_charges(p_today) n
    JOIN public.crm_expenses e ON e.id = n.r_expense_id
    WHERE e.remind_days_before IS NOT NULL
      AND n.r_next_charge_on <= p_today + e.remind_days_before
      AND e.reminded_for IS DISTINCT FROM n.r_next_charge_on
    ORDER BY n.r_next_charge_on, e.name;
$$;

COMMENT ON FUNCTION public.crm_expense_renewals_due(date) IS
    'Abbonamenti del CRM il cui rinnovo va ricordato su Telegram oggi (entro remind_days_before giorni, non ancora ricordato). Solo service role.';
