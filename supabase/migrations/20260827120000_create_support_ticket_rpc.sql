-- =============================================================================
-- create_support_ticket() — apertura di un ticket + primo messaggio, atomica
-- =============================================================================
--
-- PostgREST non ha transazioni fra due chiamate HTTP: due `.insert()`
-- sequenziali dal frontend lascerebbero un ticket senza messaggi se il secondo
-- fallisce. Il cliente vedrebbe un errore, non saprebbe se il ticket esiste, e
-- riproverebbe → ticket duplicati in coda da riconciliare a mano. Il corpo di
-- una funzione plpgsql e' invece un'unica transazione: o entrambe le righe, o
-- nessuna.
--
-- Stesso motivo per cui esistono gia' `replace_product_pairings`,
-- `replace_product_ingredients`, `replace_product_allergens`,
-- `replace_product_characteristics`, `import_products_into_catalog`.
--
-- ── SECURITY INVOKER (default), NON DEFINER ─────────────────────────────────
-- E' la scelta che rende questa funzione corta, ed e' deliberata.
--
-- Girando come CHIAMANTE, entrambe le INSERT attraversano le policy RLS
-- esistenti (20260827100000) esattamente come se arrivassero da PostgREST.
-- Di conseguenza:
--
--   QUESTA FUNZIONE NON RICONTROLLA ALCUN PERMESSO. NON E' UNA DIMENTICANZA.
--
-- Non c'e' nessun `IF NOT has_permission_any_activity(...) THEN RAISE`, e non
-- deve essercene: sarebbe una seconda copia del modello di autorizzazione,
-- libera di divergere dalle policy alla prima modifica. Le cinque RPC citate
-- sopra sono SECURITY DEFINER e DEVONO ricontrollare i permessi nel corpo,
-- perche' girando come owner scavalcano RLS. Qui no.
--
-- Corollario: se una delle due INSERT viola una policy, l'intera transazione
-- aborta con 42501 e nessuna delle due righe sopravvive. E' il comportamento
-- voluto.
--
-- ── created_by / author_user_id da auth.uid(), non da parametro ─────────────
-- Le WITH CHECK impongono `created_by = auth.uid()` e
-- `author_user_id = auth.uid()`. Prenderli da parametro non aprirebbe un buco
-- (la policy rifiuterebbe comunque un uid altrui) ma trasformerebbe un errore
-- di programmazione in un 42501 opaco, a runtime, lato client. Leggerli qui
-- rende la condizione irrappresentabile.
--
-- ── Ordine dei parametri, nessun DEFAULT ────────────────────────────────────
-- `p_activity_id` e' nullable ma NON ha DEFAULT: i default in Postgres devono
-- essere trailing, e spostarlo in coda cambierebbe l'ordine posizionale.
-- PostgREST chiama per nome, quindi il chiamante passa esplicitamente
-- `p_activity_id: null` quando il ticket non riguarda una sede. Esplicito e'
-- meglio di implicito su un argomento che sceglie un contesto.
--
-- ── INSERT ... RETURNING applica anche la policy SELECT ─────────────────────
-- Trappola gia' costata una migration su `activities` (20260611090000): con
-- RETURNING, Postgres valuta la policy SELECT sulla riga NUOVA, e se la USING
-- legge la tabella su cui si sta inserendo non puo' vedersi → INSERT abortita
-- per chiunque.
--
-- Qui e' sicuro, verificato: la SELECT di `support_tickets` e'
-- `tenant_id IN (SELECT get_my_tenant_ids()) AND
--  has_permission_any_activity('support.read', tenant_id)` — valutata
-- row-localmente sul `tenant_id` della riga nuova, e nessuna delle due funzioni
-- legge `public.support_tickets`. Nessun problema di snapshot.
-- Richiede pero' che chi apre un ticket abbia ANCHE `support.read`, non solo
-- `support.write`: vero per tutti e 4 i ruoli seedati (owner, admin, manager,
-- staff). Un futuro ruolo con la sola `support.write` romperebbe qui.
--
-- Sull'INSERT del messaggio NON si usa RETURNING, di proposito: non serve al
-- chiamante e cosi' la policy SELECT di `support_messages` non entra affatto
-- in gioco.
--
-- ACL in 20260827120001: `CREATE FUNCTION` + `REVOKE`/`GRANT` nello stesso
-- file fanno fallire `supabase db push` con SQLSTATE 42601
-- (docs/patterns/storage-sql.md).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_support_ticket(
    p_tenant_id     uuid,
    p_subject       text,
    p_activity_id   uuid,
    p_first_message text
)
RETURNS public.support_tickets
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
    v_ticket public.support_tickets;
BEGIN
    -- `created_at` e `last_message_at` sono omessi: li timbra il trigger
    -- BEFORE INSERT support_tickets_stamp_timestamps (20260827100005).
    -- `status` e' omesso: il DEFAULT 'open' e' l'unico valore che la WITH
    -- CHECK ammette in inserimento.
    INSERT INTO public.support_tickets (tenant_id, activity_id, subject, created_by)
    VALUES (p_tenant_id, p_activity_id, p_subject, auth.uid())
    RETURNING * INTO v_ticket;

    -- Vede v_ticket.id: dentro la stessa transazione ogni statement osserva
    -- gli effetti dei precedenti. La policy INSERT di support_messages fa un
    -- EXISTS sul padre, che a questo punto esiste.
    INSERT INTO public.support_messages (ticket_id, body, author_user_id, author_kind)
    VALUES (v_ticket.id, p_first_message, auth.uid(), 'customer');

    -- v_ticket e' lo snapshot PRE-trigger del messaggio: l'AFTER INSERT
    -- support_messages_touch_ticket ha nel frattempo riscritto
    -- `last_message_at` sulla riga, ma non sulla variabile. Differenza di
    -- pochi millisecondi e ininfluente per il chiamante, che usa questo
    -- ritorno per navigare al thread appena aperto. Rileggere la riga solo
    -- per allineare quel campo costerebbe una query in piu' a ogni apertura.
    RETURN v_ticket;
END;
$$;

COMMENT ON FUNCTION public.create_support_ticket(uuid, text, uuid, text) IS
    'Apre un ticket di supporto e il suo primo messaggio in un''unica transazione. SECURITY INVOKER: l''autorizzazione e'' interamente delegata alle policy RLS di support_tickets / support_messages, la funzione non ricontrolla nulla. created_by e author_user_id da auth.uid(). Ritorna la riga del ticket creato.';
