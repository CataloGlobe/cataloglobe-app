-- =============================================================================
-- RUBRICA CLIENTI — la nota del locale appartiene alla SEDE (FASE 5.3)
-- =============================================================================
-- I fatti sono dell'azienda, i giudizi sono della sede. Telefono, nome, quante
-- volte e' venuto, quante non si e' presentato: fatti, portabili, restano in
-- `reservation_guests` (scope tenant, com'e'). La nota no: la scrive una
-- persona in un contesto che non viaggia, e letta in un altro locale da chi
-- quel cliente non l'ha mai visto e' fuorviante con l'autorevolezza di una
-- cosa scritta.
--
-- Da qui una tabella SUA, activity-scoped: una riga per (ospite, sede). NON si
-- aggiunge `activity_id` a `reservation_guests`: forkerebbe l'identita' per
-- sede, che e' l'opposto di quello che vogliamo.
--
-- L'asimmetria decide: allargare dopo e' una riga di RLS; restringere dopo
-- vorrebbe dire assegnare a una sede ogni nota gia' scritta senza avere il
-- dato per farlo. Al momento della migration le note esistenti sono ZERO
-- (staging e produzione, contate il 2026-09-17): niente da spostare. La
-- colonne `reservation_guests.venue_notes` e `.tags` vengono tolte in
-- 20260917210012 / 20260917210013, dopo la vista (20260917210010/11).
--
-- Non si separano «preferenze» (portabili) da «note» (locali): sarebbe la
-- forma piu' giusta e non la costruiamo, nessun locale reale l'ha chiesta.
--
-- Un comando per file: `supabase db push` fallisce con 42601 sui file
-- multi-comando. Ordine dei timestamp = ordine giusto: prima tutto cio' che
-- aggiunge (210000-210009), in fondo tutto cio' che smonta (210010-210014).
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.reservation_guest_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  -- Il profilo sparisce (retention: purge-reservation-data) → la nota con lui.
  guest_id    uuid NOT NULL REFERENCES public.reservation_guests(id) ON DELETE CASCADE,
  -- Mai vuota: una nota vuota e' una riga da cancellare, non da tenere.
  notes       text NOT NULL CHECK (btrim(notes) <> ''),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Una nota per ospite per sede. E' anche l'indice di lettura
  -- (guest_id in testa: si legge «le note di questo ospite»).
  CONSTRAINT reservation_guest_notes_guest_activity_key UNIQUE (guest_id, activity_id)
);
