-- Le colonne di stato abbonamento su tenants sono verità di Stripe: le
-- scrivono solo stripe-webhook e stripe-checkout-confirm (service_role), il
-- cron expire-tenant-trials e le RPC SECURITY DEFINER (postgres). La policy
-- "Tenant can update own tenants" non distingue le colonne: senza questo
-- trigger l'owner poteva fare PATCH subscription_status='active' via
-- PostgREST e avere menu pubblico, ordini e quota AI senza checkout.
--
-- Tre livelli:
--   1. Sempre protette: subscription_status, stripe_customer_id,
--      stripe_subscription_id, subscription_status_event_at, trial_until,
--      current_period_start, current_period_end, plan_monthly_value_cents.
--      In INSERT devono restare al default (DEFAULT 'suspended' + NULL).
--   2. Protette solo DOPO il collegamento a Stripe (stripe_subscription_id
--      NOT NULL): plan, paid_seats, billing_interval. Prima del checkout il
--      wizard le scrive dal client (CreateBusinessWizard: scelta piano/sedi),
--      e Stripe addebita quello che dice la sessione, non la riga. Dopo il
--      collegamento arrivano solo dalla subscription.
--   3. Libere: dati di fatturazione, nome, logo, ecc. (RPC dedicate).
--
-- Esenti: service_role (edge) e postgres (RPC SECURITY DEFINER, cron,
-- migration). SECURITY INVOKER: current_user è il ruolo della sessione
-- chiamante, 'authenticated' per i client REST.
CREATE OR REPLACE FUNCTION public.protect_tenant_subscription_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.subscription_status IS DISTINCT FROM 'suspended'
       OR NEW.stripe_customer_id IS NOT NULL
       OR NEW.stripe_subscription_id IS NOT NULL
       OR NEW.subscription_status_event_at IS NOT NULL
       OR NEW.trial_until IS NOT NULL
       OR NEW.current_period_start IS NOT NULL
       OR NEW.current_period_end IS NOT NULL
       OR NEW.plan_monthly_value_cents IS NOT NULL
    THEN
      RAISE EXCEPTION
        'permission_denied: subscription columns on tenants are set only by Stripe sync (current_user: %)',
        current_user
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
     OR NEW.subscription_status_event_at IS DISTINCT FROM OLD.subscription_status_event_at
     OR NEW.trial_until IS DISTINCT FROM OLD.trial_until
     OR NEW.current_period_start IS DISTINCT FROM OLD.current_period_start
     OR NEW.current_period_end IS DISTINCT FROM OLD.current_period_end
     OR NEW.plan_monthly_value_cents IS DISTINCT FROM OLD.plan_monthly_value_cents
  THEN
    RAISE EXCEPTION
      'permission_denied: subscription columns on tenants can only be modified by service_role (current_user: %)',
      current_user
      USING ERRCODE = '42501';
  END IF;

  IF OLD.stripe_subscription_id IS NOT NULL
     AND (
       NEW.plan IS DISTINCT FROM OLD.plan
       OR NEW.paid_seats IS DISTINCT FROM OLD.paid_seats
       OR NEW.billing_interval IS DISTINCT FROM OLD.billing_interval
     )
  THEN
    RAISE EXCEPTION
      'permission_denied: plan/paid_seats/billing_interval follow the Stripe subscription once linked (current_user: %)',
      current_user
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
