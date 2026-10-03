-- =============================================================================
-- CG-09: reservations_link_guest ricava il tenant dalla sede.
-- =============================================================================
--
-- Base: pg_get_functiondef su staging il 2026-09-30. Prima di portarla su prod
-- confrontare con pg_get_functiondef di prod: devono coincidere, altrimenti si
-- riparte da quella di prod (CLAUDE.md, CREATE OR REPLACE).
--
-- Problema: la funzione (SECURITY DEFINER, BEFORE INSERT OR UPDATE OF
-- tenant_id, customer_phone_e164, customer_name, customer_email) fa l'upsert
-- in reservation_guests con NEW.tenant_id. Con un tenant_id diverso da quello
-- della sede scriverebbe nella rubrica di un'altra azienda, coi privilegi del
-- definer.
--
-- Fix: il tenant della rubrica è quello della sede (activities.tenant_id).
-- Se NEW.tenant_id non coincide la funzione rifiuta con 42501 prima di
-- scrivere, senza dipendere dall'ordine dei trigger:
-- trg_enforce_activity_tenant (20260930150500) fa lo stesso controllo ma
-- scatta dopo questo trigger (ordine alfabetico dei nomi). Il resto è
-- invariato: telefono NULL → nessun profilo, ultimo nome vince, email non si
-- azzera.
--
-- Idempotente: CREATE OR REPLACE sulla stessa firma, grant preservati.
-- SET search_path TO '' con nomi qualificati.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reservations_link_guest()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_guest_id  uuid;
  v_tenant_id uuid;
BEGIN
  -- Nessuna forma canonica → nessun profilo. Un numero non interpretabile non
  -- e' un'identita': agganciarlo creerebbe un profilo per ogni modo di
  -- scrivere lo stesso numero, che e' esattamente il problema che
  -- customer_phone_e164 esiste per risolvere.
  IF NEW.customer_phone_e164 IS NULL THEN
    NEW.guest_id := NULL;
    RETURN NEW;
  END IF;

  -- La rubrica e' quella dell'azienda della sede, mai quella dichiarata dalla
  -- riga.
  SELECT a.tenant_id INTO v_tenant_id
    FROM public.activities a
   WHERE a.id = NEW.activity_id;

  IF v_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'activity_tenant_mismatch'
      USING ERRCODE = '42501',
            DETAIL  = format('reservations.tenant_id deve essere il tenant della sede %s',
                             NEW.activity_id);
  END IF;

  INSERT INTO public.reservation_guests (
    tenant_id, phone_e164, display_name, email
  )
  VALUES (
    v_tenant_id,
    NEW.customer_phone_e164,
    -- display_name e' NOT NULL: un nome vuoto non deve far fallire una
    -- prenotazione, quindi ripiega sul telefono come etichetta.
    COALESCE(NULLIF(btrim(NEW.customer_name), ''), NEW.customer_phone_e164),
    NULLIF(btrim(NEW.customer_email), '')
  )
  ON CONFLICT (tenant_id, phone_e164) DO UPDATE
    SET
      -- Ultimo nome visto vince: se il cliente si e' presentato con un nome
      -- diverso, quello e' il nome con cui si presentera' alla porta.
      display_name = COALESCE(EXCLUDED.display_name, public.reservation_guests.display_name),
      -- L'email invece non si azzera: una prenotazione senza email non deve
      -- cancellare un contatto che avevamo.
      email        = COALESCE(EXCLUDED.email, public.reservation_guests.email),
      updated_at   = now()
  RETURNING id INTO v_guest_id;

  NEW.guest_id := v_guest_id;
  RETURN NEW;
END;
$function$;
