-- =============================================================================
-- Promemoria prenotazione: attivazione per sede, tracciamento invio,
-- conferma di presenza del cliente.
-- =============================================================================
--
-- La sera prima alle 18:00 (ora italiana) chi ha una prenotazione confermata
-- per il giorno dopo riceve un'email che gliela ricorda, con il link di
-- disdetta gia' esistente e un pulsante per confermare che verra'.
--
-- ── activities.reservation_reminder_enabled ─────────────────────────────────
-- Interruttore per sede, DEFAULT true. Acceso di default per scelta: una
-- funzione anti no-show che parte spenta non viene accesa da nessuno e quindi
-- non esiste. Stesso schema booleano di `enable_reservations`.
--
-- ── reservations.reminder_sent_at ───────────────────────────────────────────
-- Timestamp dell'invio, non un booleano: dice SE e QUANDO, e il "quando" serve
-- sia in dashboard sia per capire un promemoria arrivato all'ora sbagliata.
--
-- E' anche il lucchetto contro il doppio invio. L'edge function non legge e poi
-- scrive: rivendica la riga con un solo statement
--
--     UPDATE reservations SET reminder_sent_at = now()
--     WHERE id = ... AND reminder_sent_at IS NULL RETURNING id
--
-- e manda l'email solo se ha ottenuto la riga. La mutua esclusione sta dentro
-- l'UPDATE, quindi regge il cron eseguito due volte, il ritentativo e due
-- worker paralleli. Il prezzo e' che un guasto dell'invio DOPO la rivendicazione
-- perde quel promemoria invece di duplicarlo: e' il verso giusto, perche' un
-- cliente che riceve due volte lo stesso promemoria smette di fidarsi.
--
-- ── reservations.guest_confirmed_at ─────────────────────────────────────────
-- Quando il cliente ha premuto "confermo che vengo". Timestamp e non booleano
-- per lo stesso motivo, piu' uno suo: la sera prima il locale vuole sapere chi
-- ha risposto e chi tace, e "ha confermato alle 18:20" e "ha confermato
-- stamattina" non sono la stessa informazione operativa.
--
-- NULL = nessuna risposta. NON significa "non viene": la maggioranza dei
-- clienti non premera' nulla, e l'interfaccia deve trattarlo come silenzio.
--
-- Nessun impatto su RLS: colonne su tabelle gia' protette dalle policy
-- esistenti, scritte dall'edge function con service_role.
-- =============================================================================

ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS reservation_reminder_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz NULL;

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS guest_confirmed_at timestamptz NULL;

COMMENT ON COLUMN public.activities.reservation_reminder_enabled IS
    'Se true, le prenotazioni confermate di questa sede ricevono il promemoria alle 18:00 (ora italiana) del giorno prima. Default true.';

COMMENT ON COLUMN public.reservations.reminder_sent_at IS
    'Quando e'' stato inviato il promemoria. NULL = non ancora inviato. Rivendicato con UPDATE ... WHERE reminder_sent_at IS NULL: e'' il lucchetto che impedisce il doppio invio.';

COMMENT ON COLUMN public.reservations.guest_confirmed_at IS
    'Quando il cliente ha confermato la presenza dal link nel promemoria. NULL = nessuna risposta, NON "non viene".';

-- Indice parziale sulla query del cron: prenotazioni confermate di una certa
-- data che non hanno ancora ricevuto il promemoria. Il predicato parziale tiene
-- l'indice piccolo (le righe gia' inviate escono dall'indice all'UPDATE) e
-- rispecchia esattamente la WHERE dell'edge function.
CREATE INDEX IF NOT EXISTS idx_reservations_reminder_pending
    ON public.reservations (reservation_date)
    WHERE status = 'confirmed' AND reminder_sent_at IS NULL;
