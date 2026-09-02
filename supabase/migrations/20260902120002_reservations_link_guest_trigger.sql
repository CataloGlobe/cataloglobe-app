-- =============================================================================
-- RUBRICA CLIENTI — aggancio automatico prenotazione → profilo
-- =============================================================================
-- I profili si creano da soli. Nessuna creazione manuale: se il ristoratore
-- dovesse popolare una rubrica a mano, non lo farebbe mai, e una rubrica
-- popolata a meta' e' peggio di nessuna rubrica.
--
-- SECURITY DEFINER perche' il trigger deve poter creare il profilo anche
-- quando chi inserisce la prenotazione non ha `guests.manage` (staff di sala)
-- e quando non c'e' alcun utente (percorso pubblico, service_role). La
-- funzione non legge input arbitrario: usa solo colonne della riga in
-- transito, gia' validate dai vincoli di `reservations`.
--
-- BEFORE e non AFTER: `guest_id` viene assegnato sulla riga stessa in NEW,
-- senza una seconda UPDATE (che rifarebbe scattare i trigger).
--
-- Percorso pubblico: `place_online_reservation` inserisce SENZA e164 (la
-- normalizzazione e' JS, vive in submit-reservation), quindi l'INSERT lascia
-- guest_id NULL; l'UPDATE best-effort che segue popola customer_phone_e164 e
-- fa scattare di nuovo questo trigger, che aggancia. Se quell'UPDATE fallisce,
-- la prenotazione resta valida e semplicemente senza profilo — invariante gia'
-- stabilita dalla migration 20260827110000.
--
-- File separato: CREATE FUNCTION nello stesso file di CREATE TABLE fa fallire
-- `supabase db push` con 42601. La REVOKE sta in 20260902120003.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reservations_link_guest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_guest_id uuid;
BEGIN
  -- Nessuna forma canonica → nessun profilo. Un numero non interpretabile non
  -- e' un'identita': agganciarlo creerebbe un profilo per ogni modo di
  -- scrivere lo stesso numero, che e' esattamente il problema che
  -- customer_phone_e164 esiste per risolvere.
  IF NEW.customer_phone_e164 IS NULL THEN
    NEW.guest_id := NULL;
    RETURN NEW;
  END IF;

  INSERT INTO public.reservation_guests (
    tenant_id, phone_e164, display_name, email
  )
  VALUES (
    NEW.tenant_id,
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

COMMENT ON FUNCTION public.reservations_link_guest() IS
  'Crea o aggiorna il profilo ospite (reservation_guests) e lo aggancia alla prenotazione via guest_id. SECURITY DEFINER: deve funzionare anche per chi non ha guests.manage e per il percorso pubblico service_role.';

-- Si riattiva solo quando cambia qualcosa che riguarda l'identita' o i
-- contatti: un cambio di stato o di orario non deve toccare la rubrica.
DROP TRIGGER IF EXISTS reservations_link_guest ON public.reservations;
CREATE TRIGGER reservations_link_guest
  BEFORE INSERT OR UPDATE OF
    tenant_id, customer_phone_e164, customer_name, customer_email
  ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.reservations_link_guest();

-- NOTA — profili orfani. Se il telefono di una prenotazione viene corretto, la
-- riga passa al profilo nuovo e il vecchio puo' restare con zero visite. Non
-- viene cancellato: `v_reservation_guests_directory` filtra gia'
-- `visible_visits > 0`, quindi sparisce dall'elenco da solo. Cancellarlo
-- distruggerebbe note del locale eventualmente scritte prima della correzione.
