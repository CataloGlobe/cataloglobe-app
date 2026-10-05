-- Nessuno sconto dalla seconda sede: ogni sede paga il prezzo pieno del piano
-- (deciso da Alex e Lorenzo, call del 2026-10-03). Gli importi li fa Stripe
-- con Price `per_unit`; il frontend non legge più queste colonne.
-- DROP COLUMN toglie anche i CHECK plans_volume_discount_*_check.

ALTER TABLE public.plans
    DROP COLUMN IF EXISTS volume_discount_threshold,
    DROP COLUMN IF EXISTS volume_discount_percent;
