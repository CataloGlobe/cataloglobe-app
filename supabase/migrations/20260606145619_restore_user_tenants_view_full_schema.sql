BEGIN;

-- =============================================================================
-- FIX 2: ricostruisce user_tenants_view con tutte le 14 colonne attese dal
--        frontend + is_founder come 15a colonna.
--
-- CONTESTO
-- La fix precedente (20260606170000_restore_get_user_tenants_signature.sql)
-- aveva ripristinato la view a 8 colonne basandosi sulla migration del 29
-- marzo. ERRORE: nel tempo la view è stata estesa con colonne aggiuntive
-- (business_subtype, plan, subscription_status, trial_until, stripe_customer_id,
-- stripe_subscription_id, paid_seats) lette dal frontend.
--
-- Il frontend richiede esplicitamente, dall'URL osservato:
--   id, owner_user_id, name, vertical_type, business_subtype, created_at,
--   user_role, logo_url, plan, subscription_status, trial_until,
--   stripe_customer_id, stripe_subscription_id, paid_seats
-- = 14 colonne.
--
-- Aggiungiamo is_founder come 15a colonna (decisione di prodotto).
--
-- Tutte le colonne esistono sulla tabella public.tenants (verificato).
-- =============================================================================

DROP VIEW IF EXISTS public.user_tenants_view;
DROP FUNCTION IF EXISTS public.get_user_tenants();

CREATE FUNCTION public.get_user_tenants()
RETURNS TABLE (
  id                      uuid,
  name                    text,
  vertical_type           text,
  business_subtype        text,
  created_at              timestamptz,
  owner_user_id           uuid,
  user_role               text,
  logo_url                text,
  plan                    text,
  subscription_status     text,
  trial_until             timestamptz,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  paid_seats              integer,
  is_founder              boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    t.id,
    t.name,
    t.vertical_type,
    t.business_subtype,
    t.created_at,
    t.owner_user_id,
    CASE
      WHEN t.owner_user_id = auth.uid() THEN 'owner'
      WHEN tm.role IS NOT NULL           THEN tm.role
      ELSE NULL
    END AS user_role,
    t.logo_url,
    t.plan,
    t.subscription_status,
    t.trial_until,
    t.stripe_customer_id,
    t.stripe_subscription_id,
    t.paid_seats,
    t.is_founder
  FROM public.tenants t
  LEFT JOIN public.tenant_memberships tm
    ON  tm.tenant_id = t.id
    AND tm.user_id   = auth.uid()
    AND tm.status    = 'active'
  WHERE t.deleted_at IS NULL
    AND (
      t.owner_user_id = auth.uid()
      OR tm.user_id IS NOT NULL
    )
$$;

REVOKE ALL ON FUNCTION public.get_user_tenants() FROM public;
GRANT EXECUTE ON FUNCTION public.get_user_tenants() TO authenticated;

CREATE VIEW public.user_tenants_view AS
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
  paid_seats,
  is_founder
FROM public.get_user_tenants();

-- ─────────────────────────────────────────────────────────────────────────
-- Validation
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  view_cols     int;
  required_cols text[] := ARRAY[
    'id','name','vertical_type','business_subtype','created_at',
    'owner_user_id','user_role','logo_url','plan','subscription_status',
    'trial_until','stripe_customer_id','stripe_subscription_id',
    'paid_seats','is_founder'
  ];
  col text;
BEGIN
  -- 1. Numero colonne
  SELECT COUNT(*) INTO view_cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='user_tenants_view';

  IF view_cols <> 15 THEN
    RAISE EXCEPTION 'FAIL: user_tenants_view ha % colonne, attese 15.', view_cols;
  END IF;

  -- 2. Tutte le colonne attese presenti
  FOREACH col IN ARRAY required_cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_tenants_view'
        AND column_name = col
    ) THEN
      RAISE EXCEPTION 'FAIL: colonna % mancante in user_tenants_view.', col;
    END IF;
  END LOOP;

  RAISE NOTICE 'OK: user_tenants_view ricostruita con 15 colonne complete.';
END $$;

COMMIT;