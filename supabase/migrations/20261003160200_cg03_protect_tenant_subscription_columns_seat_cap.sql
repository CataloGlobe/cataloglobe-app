-- =============================================================================
-- CG-03: tetto a paid_seats prima del collegamento a Stripe.
-- =============================================================================
--
-- Problema: prima del link (stripe_subscription_id NULL) plan e paid_seats li
-- scrive il wizard dal client, e il trigger non li guardava: né in INSERT né
-- in UPDATE. L'unico limite sedi lato server (trg_enforce_seat_limit, BEFORE
-- INSERT ON activities) confronta con paid_seats, quindi un owner poteva
-- inserire il tenant con paid_seats = 50 (o fare PATCH prima del checkout),
-- creare 50 sedi e poi pagarne una con stripe-checkout {quantity: 1}.
--
-- Fix: prima del link paid_seats non può superare plans.max_self_service_seats
-- del piano scelto (il wizard limita già a quel valore lato client,
-- CreateBusinessWizard). Il controllo scatta solo quando paid_seats o plan
-- cambiano: un tenant legacy già sopra il tetto può ancora aggiornare nome,
-- logo e dati di fatturazione. Tetto mancante (piano senza
-- max_self_service_seats) = 1, fail-closed.
-- Dopo il link resta tutto com'era: plan / paid_seats / billing_interval
-- seguono la subscription. service_role, postgres e supabase_admin restano
-- esenti (webhook, confirm, transfer_ownership).
--
-- Base: pg_get_functiondef su staging il 2026-10-03 (unica definizione:
-- 20260918150200). Cambia solo il blocco «Tetto posti prima del link» nei
-- due rami; il resto è identico. SECURITY INVOKER invariato: plans è
-- leggibile da authenticated (policy SELECT true). CREATE OR REPLACE
-- conserva owner e grant.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.protect_tenant_subscription_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_seat_cap integer;
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

    -- Tetto posti prima del link.
    SELECT p.max_self_service_seats INTO v_seat_cap
      FROM public.plans p
     WHERE p.code = NEW.plan;
    IF NEW.paid_seats > COALESCE(v_seat_cap, 1) THEN
      RAISE EXCEPTION
        'seats_over_self_service: paid_seats % exceeds the self-service cap % for plan % (current_user: %)',
        NEW.paid_seats, COALESCE(v_seat_cap, 1), NEW.plan, current_user
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

  -- Tetto posti prima del link (solo se posti o piano cambiano).
  IF OLD.stripe_subscription_id IS NULL
     AND (
       NEW.paid_seats IS DISTINCT FROM OLD.paid_seats
       OR NEW.plan IS DISTINCT FROM OLD.plan
     )
  THEN
    SELECT p.max_self_service_seats INTO v_seat_cap
      FROM public.plans p
     WHERE p.code = NEW.plan;
    IF NEW.paid_seats > COALESCE(v_seat_cap, 1) THEN
      RAISE EXCEPTION
        'seats_over_self_service: paid_seats % exceeds the self-service cap % for plan % (current_user: %)',
        NEW.paid_seats, COALESCE(v_seat_cap, 1), NEW.plan, current_user
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
