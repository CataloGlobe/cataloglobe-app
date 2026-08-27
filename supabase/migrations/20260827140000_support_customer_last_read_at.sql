-- =============================================================================
-- SUPPORTO — segnale "hai una risposta non letta" (lato cliente)
-- =============================================================================
--
-- Due colonne su `support_tickets`, che insieme rispondono alla domanda
-- "questo ticket ha una risposta che il cliente non ha ancora visto?":
--
--   customer_last_read_at  quando il cliente ha aperto il thread l'ultima volta
--   last_message_kind      da quale lato arriva l'ultimo messaggio
--
-- Il predicato e' la congiunzione delle due:
--
--     last_message_kind = 'platform'
--     AND (customer_last_read_at IS NULL OR last_message_at > customer_last_read_at)
--
-- ── Perche' NON basta customer_last_read_at ─────────────────────────────────
-- Da sola segnalerebbe come "non letto" anche il messaggio appena scritto dal
-- cliente stesso: `last_message_at` avanza a ogni messaggio, incluso il suo.
-- Serve sapere CHI ha scritto per ultimo, e il ticket non lo sa.
--
-- Le alternative scartate:
--   - dedurlo da `status`: non regge. `in_progress` dice che la piattaforma
--     ha preso in carico, non che l'ultimo messaggio sia suo — il cliente puo'
--     replicare dopo la risposta senza che lo status cambi.
--   - aggregato su `support_messages` (DISTINCT ON (ticket_id) … created_at
--     DESC): corretto ma costa una seconda query per ogni lista di ticket, e
--     il pallino nella voce di menu la rifarebbe a ogni render. La
--     denormalizzazione qui e' la stessa scelta gia' fatta per
--     `last_message_at`, e per lo stesso motivo.
--
-- `last_message_kind` viene scritta dal trigger che gia' aggiorna
-- `last_message_at` (support_touch_ticket_on_message, aggiornato in
-- 20260827140001): stessa UPDATE, stessa transazione, `NEW.author_kind` gia'
-- disponibile. Nessuna scrittura dal client: sul ticket il cliente non ha
-- UPDATE, e un platform admin che la falsificasse otterrebbe solo di alterare
-- il proprio pallino nella UI del cliente — comunque riscritta al messaggio
-- successivo.
--
-- ── Nessuna colonna gemella lato piattaforma ────────────────────────────────
-- Volutamente non esiste `platform_last_read_at`. La coda admin
-- (`listAllTickets`) e' ordinata per attesa crescente e mostra TUTTI i ticket:
-- il lavoro da fare e' la coda stessa, non un sottoinsieme "non letto". Un
-- secondo concetto di lettura andrebbe mantenuto, sincronizzato e spiegato,
-- per un problema che la coda gia' risolve. Se un giorno la piattaforma
-- avesse piu' operatori con code separate la domanda cambierebbe, e allora si
-- aggiungera' — con il suo perche'. Documentato qui perche' l'assenza non
-- sembri una dimenticanza.
--
-- Nessuna policy nuova e nessuna policy modificata: la sola UPDATE su
-- support_tickets resta `USING (is_platform_admin())`. Il cliente aggiorna
-- `customer_last_read_at` attraverso la RPC dedicata `mark_support_ticket_read`
-- (20260827140002), SECURITY DEFINER, che ricontrolla l'autorizzazione nel
-- corpo.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. customer_last_read_at
-- -----------------------------------------------------------------------------
-- NULL e non `now()` come default, di proposito: NULL significa "mai letto dal
-- lato cliente", che e' esattamente lo stato di un ticket appena aperto e di
-- tutti quelli gia' esistenti. Un DEFAULT now() li marcherebbe tutti come
-- letti nell'istante della migration, cioe' racconterebbe una lettura che non
-- e' avvenuta — e nasconderebbe proprio le risposte in attesa che questa
-- colonna esiste per segnalare.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS customer_last_read_at timestamptz;

COMMENT ON COLUMN public.support_tickets.customer_last_read_at IS
  'Ultima apertura del thread dal lato cliente. NULL = mai letto (nessun default: '
  'un DEFAULT now() marcherebbe come letti i ticket esistenti). Scritta solo dalla '
  'RPC mark_support_ticket_read: il cliente non ha UPDATE su questa tabella.';

-- -----------------------------------------------------------------------------
-- 2. last_message_kind
-- -----------------------------------------------------------------------------
-- Nullable e senza default: un ticket senza messaggi non ha un "ultimo lato".
-- In pratica non esiste (create_support_ticket inserisce sempre il primo
-- messaggio nella stessa transazione) ma la colonna non deve mentire su un
-- caso che lo schema ammette.
--
-- CHECK con gli stessi due valori di support_messages.author_kind: la colonna
-- e' una copia denormalizzata di quel dato e deve accettarne esattamente il
-- dominio.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS last_message_kind text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.support_tickets'::regclass
      AND conname  = 'support_tickets_last_message_kind_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_last_message_kind_check
      CHECK (last_message_kind IN ('customer', 'platform'));
  END IF;
END $$;

COMMENT ON COLUMN public.support_tickets.last_message_kind IS
  'Denormalizzato: author_kind dell''ultimo messaggio del thread, scritto dal trigger '
  'support_touch_ticket_on_message insieme a last_message_at. Serve al predicato '
  '"risposta non letta", che senza sapere chi ha scritto per ultimo segnalerebbe anche '
  'i messaggi del cliente stesso. NULL solo per un ticket senza messaggi.';

-- -----------------------------------------------------------------------------
-- 3. Backfill di last_message_kind
-- -----------------------------------------------------------------------------
-- Ultimo messaggio per ticket. `id DESC` come tie-break dopo `created_at DESC`:
-- due messaggi nello stesso microsecondo sono improbabili ma l'ordinamento
-- deve essere totale, altrimenti il risultato del backfill non e'
-- deterministico.
--
-- `customer_last_read_at` NON viene backfillata: resta NULL ovunque, che e' il
-- valore giusto (vedi sopra).
--
-- NOTA sui trigger BEFORE UPDATE che questa UPDATE risveglia:
--   support_tickets_derive_closed_at → `status` non cambia, quindi ricade nel
--     ramo che conserva OLD.closed_at (o lo lascia NULL). Nessun effetto.
--   support_tickets_set_updated_at   → `updated_at` avanza a now() su ogni
--     ticket toccato. E' l'unico effetto collaterale del backfill ed e'
--     onesto: la riga e' stata effettivamente modificata. Nessuna query del
--     dominio ordina o filtra su `updated_at` (la coda usa last_message_at).
UPDATE public.support_tickets t
   SET last_message_kind = m.author_kind
  FROM (
        SELECT DISTINCT ON (ticket_id)
               ticket_id,
               author_kind
          FROM public.support_messages
         ORDER BY ticket_id, created_at DESC, id DESC
       ) m
 WHERE m.ticket_id = t.id
   AND t.last_message_kind IS DISTINCT FROM m.author_kind;

-- -----------------------------------------------------------------------------
-- 4. Indice
-- -----------------------------------------------------------------------------
-- Parziale su `last_message_kind = 'platform'`: le sole righe che possono
-- essere "non lette" sono quelle la cui ultima parola e' della piattaforma.
-- Il conteggio per il pallino e' `WHERE tenant_id = ? AND last_message_kind =
-- 'platform' AND (customer_last_read_at IS NULL OR last_message_at >
-- customer_last_read_at)`: il predicato residuo si valuta sulle poche righe
-- che l'indice restituisce.
CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant_unread
  ON public.support_tickets (tenant_id, last_message_at)
  WHERE last_message_kind = 'platform';

COMMIT;
