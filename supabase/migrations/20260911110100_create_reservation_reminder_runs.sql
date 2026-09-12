-- =============================================================================
-- RESERVATION_REMINDER_RUNS — registro delle passate del promemoria
-- =============================================================================
--
-- Una riga per esecuzione di `send-reservation-reminders`. Risponde alla domanda
-- "il promemoria ha funzionato stasera?", che le colonne su `reservations` non
-- possono risolvere: quelle raccontano la singola prenotazione, questa racconta
-- il giro. Un giro con zero candidati e un giro mai partito sono indistinguibili
-- guardando solo le prenotazioni, e sono due guasti diversi.
--
-- ── STRUMENTO DI PIATTAFORMA, NON DATO DEL TENANT ───────────────────────────
-- Questo registro serve a chi gestisce la piattaforma per sapere se il giro
-- serale ha girato. Non e' materiale del cliente: e' strumentazione nostra, e va
-- letta come si legge un log, non come si legge la propria dashboard.
--
-- Per questo NON ha `tenant_id`, e non e' una dimenticanza da "sistemare". La
-- funzione gira con service_role su TUTTE le sedi di tutti i tenant in un colpo
-- solo: una passata non appartiene a nessun tenant in particolare, e
-- appiccicargliene uno costringerebbe a spezzare artificialmente il giro o a
-- scrivere un tenant arbitrario. Le due cose si tengono: non ha un proprietario
-- perche' non e' roba di nessun proprietario.
--
-- La colonna `skipped` conserva l'aggregato per motivo, non l'elenco di chi: il
-- dettaglio per prenotazione vive su `reservations`, dove ha un tenant e le
-- policy che gli competono.
--
-- Conseguenza sulla RLS: la lettura non filtra per tenant perche' non c'e' nulla
-- da filtrare. Vedi la sezione 4 — legge solo l'amministrazione di piattaforma.
--
-- ── Registro, non stato ─────────────────────────────────────────────────────
-- Nessuna policy di INSERT/UPDATE/DELETE per `authenticated`. Scrive solo
-- service_role, che bypassa RLS. Una riga di questo registro non si corregge:
-- se e' sbagliata, e' sbagliato cio' che e' successo, ed e' esattamente
-- l'informazione che si vuole conservare.
--
-- ── Mai dati personali qui dentro ───────────────────────────────────────────
-- `errors` porta `reservation_id` e messaggio. MAI indirizzi email, MAI numeri
-- di telefono, MAI nomi. Il vincolo resta anche ora che legge solo
-- l'amministrazione di piattaforma, e non e' un residuo della policy precedente:
-- una tabella di diagnostica e' il posto dove i dati dei clienti finiscono per
-- sbaglio e restano per anni, fuori da ogni cancellazione per tenant e da ogni
-- richiesta di rimozione. Il `reservation_id` basta a risalire a tutto il resto
-- passando da `reservations`, dove i permessi ci sono.
--
-- Chi scrive il codice della 1.2 deve troncare la lista ai primi N errori: un
-- giro andato storto per intero non deve poter gonfiare una riga fino a
-- diventare un problema suo.
--
-- Nessuno scrive ancora qui: la tabella nasce vuota e resta vuota finche' non
-- arriva il codice.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservation_reminder_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- La data PER CUI si mandava (il giorno dopo), non il giorno in cui si e'
  -- girato: e' quella che serve per capire quale serata e' rimasta scoperta.
  target_date    date NOT NULL,

  started_at     timestamptz NOT NULL DEFAULT now(),

  -- NULL = il giro non e' arrivato in fondo. Un timeout della funzione, un
  -- crash, un deploy a meta' passata lasciano questa colonna a NULL, ed e'
  -- proprio il caso che oggi non sapremmo distinguere da "non partito".
  finished_at    timestamptz NULL,

  -- L'invio riuscito del 30/08 alle 17:17 era un'invocazione a mano. Non poterlo
  -- distinguere ci ha fatto contare tre successi del cron quando erano due.
  trigger_source text NOT NULL
                 CHECK (trigger_source IN ('cron','manual')),

  candidates     int NOT NULL DEFAULT 0,
  sent           int NOT NULL DEFAULT 0,
  failed         int NOT NULL DEFAULT 0,

  -- Dettaglio degli scarti per motivo: {"subscription": 2, "no_email": 1, ...}.
  -- JSONB e non una colonna per motivo: i motivi cambieranno con le regole di
  -- ammissione, e non voglio una migration per ognuno.
  skipped        jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Al massimo i primi N errori: [{"reservation_id": "...", "message": "..."}].
  -- Vedi la nota sui dati personali in testa al file.
  errors         jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reservation_reminder_runs IS
  'Registro delle esecuzioni di send-reservation-reminders: una riga per passata. Strumento di piattaforma, non dato del tenant: per questo senza tenant_id. Scrive service_role, legge solo is_platform_admin().';

COMMENT ON COLUMN public.reservation_reminder_runs.target_date IS
  'La data PER CUI si mandava il promemoria (tipicamente domani), non il giorno di esecuzione.';

COMMENT ON COLUMN public.reservation_reminder_runs.finished_at IS
  'NULL = il giro non e'' arrivato in fondo (crash, timeout, deploy a meta'' passata). Distingue "non partito" da "partito e interrotto".';

COMMENT ON COLUMN public.reservation_reminder_runs.trigger_source IS
  '''cron'' = invocazione programmata; ''manual'' = invocazione a mano. Senza questa distinzione i test manuali si contano come successi del cron.';

COMMENT ON COLUMN public.reservation_reminder_runs.skipped IS
  'Aggregato degli scarti per motivo, es. {"subscription":2,"venue_inactive":1,"reminder_disabled":0,"no_email":3}. JSONB perche'' i motivi cambiano senza migration.';

COMMENT ON COLUMN public.reservation_reminder_runs.errors IS
  'Primi N errori del giro: [{"reservation_id":"...","message":"..."}]. MAI email, telefoni o nomi: e'' diagnostica di piattaforma, fuori dalla cancellazione per tenant e dalle richieste di rimozione. Il reservation_id basta a risalire al resto da reservations.';

-- -----------------------------------------------------------------------------
-- 2. Indexes
-- -----------------------------------------------------------------------------
-- "Com'e' andata per la serata di domani?" e "com'e' andato l'ultimo giro?" sono
-- le due sole letture previste, ed entrambe leggono dal fondo.
CREATE INDEX IF NOT EXISTS idx_reservation_reminder_runs_target_date
  ON public.reservation_reminder_runs (target_date DESC);

CREATE INDEX IF NOT EXISTS idx_reservation_reminder_runs_started_at
  ON public.reservation_reminder_runs (started_at DESC);

-- -----------------------------------------------------------------------------
-- 3. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.reservation_reminder_runs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 4. Policy di sola lettura
-- -----------------------------------------------------------------------------
-- Legge solo l'amministrazione di piattaforma. Nessun ruolo del tenant vede
-- queste righe: un giro copre tutte le sedi di tutti i clienti, e i contatori
-- aggregati di una passata dicono qualcosa sugli altri tenant anche quando non
-- ne nominano nessuno. Un cliente che vuole sapere se la SUA prenotazione ha
-- ricevuto il promemoria lo legge da `reservations`, dove ha il permesso e dove
-- la riga e' sua.
--
-- Nessuna policy per INSERT/UPDATE/DELETE: con RLS abilitata e nessuna policy,
-- `authenticated` non puo' scrivere. Solo service_role, che bypassa.
DROP POLICY IF EXISTS "Platform admins can read reservation_reminder_runs"
  ON public.reservation_reminder_runs;
CREATE POLICY "Platform admins can read reservation_reminder_runs"
  ON public.reservation_reminder_runs FOR SELECT TO authenticated
  USING (public.is_platform_admin());

COMMIT;
