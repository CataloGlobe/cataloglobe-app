-- =============================================================================
-- mark_support_ticket_read() — il cliente marca letto un proprio ticket
-- =============================================================================
--
-- Il cliente NON ha UPDATE su `support_tickets`: la sola policy UPDATE e'
-- `USING (is_platform_admin())` (20260827100000) e questo commit non la tocca.
-- Un `.update({ customer_last_read_at })` dal frontend toccherebbe zero righe,
-- senza errore — il silenzio peggiore. Da qui una RPC dedicata.
--
-- ── SECURITY DEFINER, e qui serve davvero ───────────────────────────────────
-- Al contrario delle funzioni di stamp (20260827100004) e di
-- support_derive_closed_at (20260827130000), che sono INVOKER perche' toccano
-- solo NEW/OLD in memoria, e al contrario di create_support_ticket
-- (20260827120000), che e' INVOKER perche' le sue INSERT passano da policy
-- gia' scritte per il cliente. Qui non esiste alcuna policy che ammetta questa
-- UPDATE: girando come chiamante la funzione aggiornerebbe zero righe. DEFINER
-- e' l'unico modo, ed e' lo stesso motivo per cui lo e'
-- support_touch_ticket_on_message.
--
-- ── E percio' l'autorizzazione va RICONTROLLATA nel corpo ────────────────────
-- Girando come owner la funzione scavalca RLS: senza il doppio vincolo qui
-- sotto, chiunque sia autenticato potrebbe marcare letto un ticket di
-- qualunque azienda passandone l'id. Il predicato e' identico nella forma a
-- quello delle policy di 20260827100000 — appartenenza al tenant DELLA RIGA
-- piu' permesso keyed su quel tenant:
--
--     tenant_id IN (SELECT public.get_my_tenant_ids())
--     AND public.has_permission_any_activity('support.read', tenant_id)
--
-- `has_permission_any_activity` e non `has_permission`: con p_activity_id NULL
-- i branch owner/admin di quest'ultima non correlano il tenant e ritornano
-- true se il chiamante ha il permesso in UN tenant qualsiasi (vedi il commento
-- esteso in 20260827100000). Su una funzione DEFINER quella differenza e'
-- esattamente la fuga cross-tenant.
--
-- `support.read` e non `support.write`: marcare letto e' una conseguenza
-- dell'aver aperto il thread, non un contributo alla conversazione. Chi puo'
-- leggere puo' segnare di aver letto.
--
-- ── Silenzio su ticket altrui o inesistenti ─────────────────────────────────
-- Nessun RAISE. Se il WHERE non seleziona nulla, la UPDATE tocca zero righe e
-- la funzione ritorna normalmente. Distinguere "non esiste" da "non e' tuo"
-- rivelerebbe l'esistenza di ticket di altre aziende a chi prova id a caso —
-- la stessa ragione per cui `getTicket` lato service accorpa i due casi.
-- `RETURNS void` rende la cosa strutturale: non c'e' un valore di ritorno da
-- interpretare, quindi non c'e' un canale da cui dedurre alcunche'.
--
-- ── Cosa NON puo' scrivere ──────────────────────────────────────────────────
-- La SET tocca una sola colonna, `customer_last_read_at`. Non c'e' un
-- parametro per il valore: viene da `now()`, cioe' dall'orologio del server,
-- coerentemente con ogni altro timestamp del dominio (20260827100004 /
-- 20260827130000). Un client non puo' antidatare la propria lettura per
-- tenersi il pallino, ne' postdatarla per spegnerlo su risposte future.
--
-- ── Trigger risvegliati da questa UPDATE ────────────────────────────────────
-- Sono i due BEFORE UPDATE ROW su support_tickets, in ordine alfabetico:
--
--   support_tickets_derive_closed_at — `status` non e' nella SET, quindi
--     NEW.status = OLD.status. Su un ticket chiuso vale il ramo 2
--     (`NEW.status = 'closed'`) → NEW.closed_at := OLD.closed_at, l'istante
--     originale conservato. Su un ticket non chiuso vale il ramo ELSE →
--     NULL, che per l'invariante `closed_at IS NOT NULL ⟺ status = 'closed'`
--     e' gia' il valore corrente. In entrambi i casi: nessun cambiamento
--     osservabile. E' il ramo che preserva, come previsto.
--
--   support_tickets_set_updated_at — porta `updated_at` a now(). E' l'unico
--     effetto oltre alla colonna voluta, ed e' corretto: la riga e' stata
--     davvero modificata. Nessuna query del dominio ordina o filtra su
--     `updated_at` — la coda admin usa `last_message_at`, la lista cliente
--     pure — quindi non sposta nulla di visibile.
--
-- Non scatta invece `support_touch_ticket_on_message`: e' AFTER INSERT su
-- support_messages, un'altra tabella e un altro comando.
--
-- ACL in 20260827140003: `CREATE FUNCTION` + `REVOKE`/`GRANT` nello stesso
-- file fanno fallire `supabase db push` con SQLSTATE 42601
-- (docs/patterns/storage-sql.md).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_support_ticket_read(p_ticket_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
    UPDATE public.support_tickets t
       SET customer_last_read_at = now()
     WHERE t.id = p_ticket_id
       AND t.tenant_id IN (SELECT public.get_my_tenant_ids())
       AND public.has_permission_any_activity('support.read', t.tenant_id);
$$;

COMMENT ON FUNCTION public.mark_support_ticket_read(uuid) IS
    'Marca letto dal lato cliente un ticket del proprio tenant: aggiorna la sola customer_last_read_at a now(). SECURITY DEFINER perche'' il cliente non ha UPDATE su support_tickets; per questo il corpo ricontrolla appartenenza al tenant + support.read con la stessa forma delle policy. Ticket altrui o inesistente: zero righe aggiornate, nessun errore.';
