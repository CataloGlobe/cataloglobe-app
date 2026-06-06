BEGIN;

-- =============================================================================
-- FIX: ripristina firma originale di get_user_tenants() + user_tenants_view
--
-- CONTESTO
-- La migration 20260606140300_tenants_add_subscription_columns.sql ha
-- ricreato get_user_tenants() e user_tenants_view aggiungendo 7 colonne
-- (business_subtype, plan, subscription_status, trial_until,
-- stripe_customer_id, stripe_subscription_id, is_founder), portandole da 7 a
-- 14 colonne.
--
-- La firma originale, definita nelle migration:
--   - 20260329100000_get_user_tenants_function.sql
--   - 20260329110000_user_tenants_view_delegate_to_function.sql
-- era esplicitamente "frozen" a 7 colonne, come scritto nei commenti di sicurezza
-- dell'autore originale. Gli altri campi (plan, stripe_*, ecc.) vengono letti
-- dal frontend con query separate, NON via la view.
--
-- L'espansione ha rotto il frontend (workspace vuoto, tenant non visibili)
-- probabilmente per mismatch di schema atteso dal client.
--
-- SCOPO DI QUESTA MIGRATION
-- 1. Ripristinare get_user_tenants() alla firma originale a 7 colonne
-- 2. Aggiungere is_founder come 8a colonna (decisione di prodotto: vogliamo
--    che il frontend possa identificare i tenant founder dalla view senza
--    query supplementari)
-- 3. Ricreare user_tenants_view con le stesse 8 colonne, delegando alla funzione
--
-- Il campo is_founder è giustificato come aggiunta perché:
--   - È un dato di stato del tenant rilevante per la UX (es. badge "Founder")
--   - Non è sensibile come stripe_customer_id
--   - Non viola il principio di "minimum exposure" più di quanto già non
--     facciano name e logo_url
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Drop nell'ordine corretto (view dipende dalla funzione)
-- ─────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.user_tenants_view;
DROP FUNCTION IF EXISTS public.get_user_tenants();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Ricrea la funzione con la firma originale + is_founder
-- ─────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.get_user_tenants()
RETURNS TABLE (
  id             uuid,
  name           text,
  vertical_type  text,
  created_at     timestamptz,
  owner_user_id  uuid,
  user_role      text,
  logo_url       text,
  is_founder     boolean
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
    t.created_at,
    t.owner_user_id,
    CASE
      WHEN t.owner_user_id = auth.uid() THEN 'owner'
      WHEN tm.role IS NOT NULL           THEN tm.role
      ELSE NULL
    END AS user_role,
    t.logo_url,
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

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Ricrea la view come wrapper sulla funzione (8 colonne esplicite)
-- ─────────────────────────────────────────────────────────────────────────

CREATE VIEW public.user_tenants_view AS
SELECT
  id,
  name,
  vertical_type,
  created_at,
  owner_user_id,
  user_role,
  logo_url,
  is_founder
FROM public.get_user_tenants();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Validation
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  fn_secdef    boolean;
  fn_volatile  char;
  view_cols    int;
BEGIN
  -- 4a. Verifica firma funzione
  SELECT p.prosecdef, p.provolatile
    INTO fn_secdef, fn_volatile
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_user_tenants';

  IF fn_secdef IS NULL THEN
    RAISE EXCEPTION 'FAIL: get_user_tenants() non creata.';
  END IF;

  IF NOT fn_secdef THEN
    RAISE EXCEPTION 'FAIL: get_user_tenants() non è SECURITY DEFINER.';
  END IF;

  IF fn_volatile <> 's' THEN
    RAISE EXCEPTION 'FAIL: get_user_tenants() non è STABLE.';
  END IF;

  RAISE NOTICE 'OK: get_user_tenants() ricreata SECURITY DEFINER STABLE.';

  -- 4b. Verifica view ha 8 colonne (firma originale + is_founder)
  SELECT COUNT(*) INTO view_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'user_tenants_view';

  IF view_cols <> 8 THEN
    RAISE EXCEPTION 'FAIL: user_tenants_view ha % colonne, attese 8.', view_cols;
  END IF;

  RAISE NOTICE 'OK: user_tenants_view ha 8 colonne (firma originale + is_founder).';

  -- 4c. Verifica colonne attese
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_tenants_view'
      AND column_name='is_founder'
  ) THEN
    RAISE EXCEPTION 'FAIL: is_founder mancante in user_tenants_view.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_tenants_view'
      AND column_name IN ('plan','stripe_customer_id','stripe_subscription_id',
                          'business_subtype','subscription_status','trial_until')
  ) THEN
    RAISE EXCEPTION 'FAIL: user_tenants_view contiene colonne non attese (firma espansa non ripristinata).';
  END IF;

  RAISE NOTICE 'OK: schema view rispristinato correttamente.';
END $$;

COMMIT;