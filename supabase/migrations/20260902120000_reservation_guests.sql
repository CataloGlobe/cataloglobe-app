-- =============================================================================
-- RUBRICA CLIENTI — profilo ospite (modello ibrido)
-- =============================================================================
-- Da elenco di prenotazioni a conoscenza dei clienti. Il profilo esiste per
-- EROGARE IL SERVIZIO: riconoscere chi arriva, sapere se ha allergie, sapere
-- se non si e' presentato. NON e' uno strumento di marketing: nessun invio,
-- nessuna esportazione, nessuna azione di gruppo (vincolo di prodotto, non
-- solo di interfaccia — vedi anche l'assenza di policy DELETE piu' sotto).
--
-- MODELLO IBRIDO, motivazione:
--   * `reservation_guests` ospita SOLO cio' che non appartiene a nessuna
--     prenotazione: note del locale, tag, e gli ultimi contatti noti.
--   * Gli AGGREGATI (numero visite, no-show, ultima visita) NON sono colonne:
--     vivono nelle view `v_reservation_guest_*`, ricalcolate dalle
--     prenotazioni. Un contatore materializzato diverge al primo `no_show`
--     revocato, e `no_show` e' reversibile per design (vedi
--     src/types/reservation.ts).
--   * `display_name` / `email` SONO colonne pur essendo derivabili: sono
--     snapshot dell'ultimo valore visto, riscritti dal trigger a ogni
--     prenotazione, non aggregati. Servono a rendere la ricerca per nome
--     indicizzabile senza join sull'intero storico. Non possono divergere:
--     hanno una sola sorgente di scrittura.
--
-- CHIAVE DI IDENTITA': `phone_e164`. `customer_phone` grezzo non puo' esserlo
-- (3451559558 / 345 155-9558 / +39 345 1559558 sono la stessa persona).
-- Righe con `customer_phone_e164 IS NULL` restano semplicemente senza profilo:
-- un numero che non sappiamo canonicalizzare non deve costare una prenotazione
-- ne' inquinare la rubrica con un profilo per ogni variante di scrittura.
--
-- SCOPE AZIENDA, non sede: le sedi di un tenant sono la stessa azienda, stesso
-- titolare dei dati. Un hotel deve riconoscere il cliente al ristorante e al
-- bar. Lo storico dice in quale sede e' avvenuta ogni visita — e lo mostra solo
-- a chi ha il permesso su quella sede (vedi `v_reservation_guest_visits`).
--
-- NIENTE CREATE FUNCTION / GRANT / REVOKE / DROP-CREATE in questo file:
-- `supabase db push` fallisce con 42601. Le view vivono in 20260902120001, il
-- trigger di aggancio in 20260902120002, la sua revoca in 20260902120003.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tabella profilo
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservation_guests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Identita'. UNIQUE per tenant: lo stesso numero in due aziende diverse e'
  -- due profili diversi, ciascuno di proprieta' della sua azienda.
  phone_e164   text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),

  -- Ultimi contatti noti, riscritti dal trigger a ogni prenotazione.
  display_name text NOT NULL,
  email        text,

  -- Note scritte DAL LOCALE ("preferisce il tavolo in fondo"). Da non
  -- confondere con `reservations.notes`, scritte DAL CLIENTE ("allergico alle
  -- spezie"): sono due cose diverse, hanno due autori diversi e non vanno
  -- mescolate ne' in lettura ne' in scrittura.
  venue_notes  text,

  -- Marcature libere (abituale, VIP, allergie). Array e non tabella dedicata:
  -- l'insieme e' piccolo, non ha attributi propri e non deve essere condiviso
  -- fra profili.
  tags         text[] NOT NULL DEFAULT '{}',

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reservation_guests_tenant_phone_key UNIQUE (tenant_id, phone_e164)
);

COMMENT ON TABLE public.reservation_guests IS
  'Profilo ospite per azienda (tenant), chiave = telefono E.164. Creato solo dal trigger reservations_link_guest: nessuna creazione manuale. Contiene note/tag del locale; visite e no-show sono calcolati dalle view v_reservation_guest_*.';
COMMENT ON COLUMN public.reservation_guests.venue_notes IS
  'Note del LOCALE, non visibili al cliente. Distinte da reservations.notes, che sono scritte dal cliente.';
COMMENT ON COLUMN public.reservation_guests.display_name IS
  'Ultimo nome visto in prenotazione. Snapshot riscritto dal trigger, non un campo editabile a mano.';

-- -----------------------------------------------------------------------------
-- 2. Indici
-- -----------------------------------------------------------------------------
-- Lookup per telefono (ricerca in inserimento manuale). Coperto dalla UNIQUE
-- (tenant_id, phone_e164), nessun indice aggiuntivo necessario.

-- Ricerca per nome, case/accent-insensitive, prefix-friendly.
CREATE INDEX IF NOT EXISTS idx_reservation_guests_tenant_name
  ON public.reservation_guests (tenant_id, lower(display_name));

CREATE INDEX IF NOT EXISTS idx_reservation_guests_tags
  ON public.reservation_guests USING gin (tags);

-- -----------------------------------------------------------------------------
-- 3. updated_at
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS reservation_guests_set_updated_at
  ON public.reservation_guests;
CREATE TRIGGER reservation_guests_set_updated_at
  BEFORE UPDATE ON public.reservation_guests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Aggancio dalla prenotazione
-- -----------------------------------------------------------------------------
-- FK esplicita e non join derivato su `customer_phone_e164`: se un operatore
-- corregge il telefono di una prenotazione, il trigger risposta la riga sul
-- profilo giusto e lo storico resta coerente. ON DELETE SET NULL: cancellare
-- un profilo non deve mai cancellare prenotazioni.
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS guest_id uuid NULL
  REFERENCES public.reservation_guests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_guest
  ON public.reservations (guest_id)
  WHERE guest_id IS NOT NULL;

COMMENT ON COLUMN public.reservations.guest_id IS
  'Profilo ospite agganciato dal trigger reservations_link_guest. NULL quando customer_phone_e164 e'' NULL (numero non canonicalizzabile o riga anteriore alla migration 20260827110000, mai backfillata).';

-- -----------------------------------------------------------------------------
-- 5. Permessi (activity-scoped, categoria operations)
-- -----------------------------------------------------------------------------
-- Scope `activity` e non `tenant` per coerenza con reservations.*: un manager
-- di una sola sede resterebbe fuori da un permesso tenant-scope, pur essendo
-- esattamente la figura che la rubrica serve.
--
-- staff e viewer NON ricevono guests.read: la rubrica e' l'elenco completo dei
-- clienti dell'azienda, piu' sensibile della singola prenotazione del turno.
-- Chi lavora il servizio continua a vedere note e allergie dove servono —
-- sulla prenotazione — senza poter sfogliare l'archivio.
INSERT INTO public.permissions (id, scope, category, description) VALUES
  ('guests.read',   'activity', 'operations', 'Vedere la rubrica clienti dell''azienda'),
  ('guests.manage', 'activity', 'operations', 'Modificare note e tag dei clienti')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('owner',   'guests.read'),
  ('owner',   'guests.manage'),
  ('admin',   'guests.read'),
  ('admin',   'guests.manage'),
  ('manager', 'guests.read'),
  ('manager', 'guests.manage')
ON CONFLICT (role, permission_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. RLS
-- -----------------------------------------------------------------------------
-- La tabella e' tenant-wide ma il permesso e' activity-scoped: il gate giusto
-- e' has_permission_any_activity(perm, tenant_id) — chi ha il permesso su
-- almeno una sede del tenant accede alla rubrica. Il filtro fine (quali visite
-- vede) e' nella view, non qui: un profilo e' dell'azienda, una visita e' di
-- una sede.
ALTER TABLE public.reservation_guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Roles can read reservation guests" ON public.reservation_guests;
CREATE POLICY "Roles can read reservation guests"
  ON public.reservation_guests FOR SELECT TO authenticated
  USING (public.has_permission_any_activity('guests.read', tenant_id));

-- Solo note e tag sono editabili a mano; identita' e contatti li scrive il
-- trigger. La policy non puo' vincolare QUALI colonne cambiano: quel vincolo
-- vive nel service layer (update mirato su venue_notes/tags).
DROP POLICY IF EXISTS "Roles can update reservation guests" ON public.reservation_guests;
CREATE POLICY "Roles can update reservation guests"
  ON public.reservation_guests FOR UPDATE TO authenticated
  USING      (public.has_permission_any_activity('guests.manage', tenant_id))
  WITH CHECK (public.has_permission_any_activity('guests.manage', tenant_id));

-- NESSUNA policy INSERT e NESSUNA policy DELETE per `authenticated`, di
-- proposito:
--   * INSERT — i profili nascono solo da una prenotazione, via trigger
--     SECURITY DEFINER. Se il ristoratore dovesse popolare una rubrica a mano,
--     non lo farebbe mai, e una rubrica popolata a meta' e' peggio di nessuna.
--   * DELETE — cancellare un profilo non cancella le prenotazioni, quindi il
--     trigger lo ricreerebbe alla visita successiva: un pulsante "elimina" che
--     non elimina e' una bugia. La cancellazione per richiesta dell'interessato
--     e' un flusso a se' (va rimossa anche la prenotazione) e non e' in questa
--     fase. PENDENZA DICHIARATA, non dimenticanza.

COMMIT;
