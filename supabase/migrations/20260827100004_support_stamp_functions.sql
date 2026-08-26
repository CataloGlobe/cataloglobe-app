-- =============================================================================
-- SUPPORTO — funzioni BEFORE INSERT che timbrano i timestamp server-side
-- =============================================================================
--
-- `created_at` e `last_message_at` hanno un DEFAULT now(), ma un DEFAULT copre
-- solo la colonna OMESSA: un client PostgREST che la include nel payload vince
-- sul default. Nessuna WITH CHECK di 20260827100000 li vincola, quindi oggi
-- sono scrivibili dal client.
--
-- Conseguenze concrete:
--   support_tickets  — `last_message_at` retrodatato scavalca la coda admin
--                      ordinata su idx_support_tickets_status_last_message.
--   support_messages — `created_at` retrodatato altera l'ordine APPARENTE
--                      della conversazione: un messaggio scritto dopo puo'
--                      comparire prima di quello a cui risponde. In un thread
--                      di supporto e' la cronologia stessa a essere il dato.
--
-- ── Perche' un trigger e non una WITH CHECK ─────────────────────────────────
-- Un vincolo tipo `last_message_at = created_at` NON risolve: si retrodatano
-- entrambi e il vincolo resta soddisfatto. Un `created_at >= now() - interval`
-- funzionerebbe, ma introduce una finestra di tolleranza arbitraria da tarare.
-- Un BEFORE INSERT che RISCRIVE il valore e' deterministico: qualunque cosa
-- arrivi dal client viene sostituita, senza finestre e senza soglie.
--
-- ── SECURITY INVOKER (default), NON DEFINER ─────────────────────────────────
-- Scelta deliberata. Queste funzioni non leggono e non scrivono alcuna tabella:
-- toccano solo il record NEW in memoria, prima che la riga sia materializzata.
-- Non serve alcun privilegio che il chiamante non abbia gia', quindi DEFINER
-- sarebbe privilegio gratuito — la regola di progetto e' "DEFINER solo se
-- necessario". Diverso il caso di support_touch_ticket_on_message()
-- (20260827100001), che DEVE essere DEFINER perche' scrive su support_tickets,
-- dove il cliente non ha UPDATE.
--
-- `SET search_path TO ''` comunque: non c'e' un riferimento non qualificato da
-- dirottare, ma la regola vale per ogni funzione e costa zero.
--
-- ── Due funzioni e non una condivisa ────────────────────────────────────────
-- `support_messages` non ha la colonna `last_message_at`. Una funzione sola
-- dovrebbe ramificare su TG_TABLE_NAME, e plpgsql risolve i campi di NEW a
-- RUNTIME: un ramo sbagliato non fallisce alla CREATE FUNCTION ma al primo
-- INSERT in produzione, con "record NEW has no field last_message_at". In piu'
-- legherebbe il corpo ai nomi delle tabelle. Due funzioni sono ciascuna totale
-- sul proprio dominio e verificabili staticamente. Il costo e' una duplicazione
-- di tre righe.
--
-- ── Ordine di esecuzione rispetto agli altri trigger ────────────────────────
-- Verificato, nessun conflitto:
--   1. BEFORE INSERT su support_messages (questo) timbra NEW.created_at del
--      MESSAGGIO. Poi la WITH CHECK della INSERT policy valuta la riga finale
--      (Postgres applica RLS dopo i BEFORE ROW trigger) — nessuna delle policy
--      di 20260827100000 referenzia created_at, quindi la riscrittura non le
--      influenza.
--   2. AFTER INSERT su support_messages (20260827100002) scrive
--      last_message_at sul TICKET PADRE. Tabella diversa, riga diversa, fase
--      diversa: non c'e' sovrapposizione con il punto 1.
--   3. Il BEFORE INSERT su support_tickets (questo) parte SOLO alla creazione
--      del ticket. L'UPDATE fatta dal trigger AFTER e' una UPDATE, non una
--      INSERT: non lo risveglia, e il suo `now()` resta l'ultima parola sul
--      valore di last_message_at.
--   4. Sull'UPDATE del padre resta support_tickets_set_updated_at (BEFORE
--      UPDATE), che tocca solo updated_at.
--
-- ACL e CREATE TRIGGER vivono in 20260827100005: `CREATE FUNCTION` +
-- `REVOKE`/`GRANT` nello stesso file fanno fallire `supabase db push` con
-- SQLSTATE 42601 (docs/patterns/storage-sql.md).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.support_stamp_ticket_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
    -- Riscrittura incondizionata: il valore inviato dal client viene
    -- scartato, non validato.
    NEW.created_at      := now();
    NEW.last_message_at := now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.support_stamp_ticket_timestamps() IS
    'Trigger BEFORE INSERT su support_tickets: forza created_at e last_message_at a now(), ignorando i valori del client (il DEFAULT copre solo la colonna omessa). SECURITY INVOKER: tocca solo NEW, nessun privilegio richiesto.';

CREATE OR REPLACE FUNCTION public.support_stamp_message_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
    NEW.created_at := now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.support_stamp_message_timestamp() IS
    'Trigger BEFORE INSERT su support_messages: forza created_at a now(). Impedisce di retrodatare un messaggio e alterare l''ordine apparente del thread. SECURITY INVOKER.';
