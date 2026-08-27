-- =============================================================================
-- support_derive_closed_at() — closed_at derivato dallo status, server-side
-- =============================================================================
--
-- Finora `closed_at` lo scriveva il service, con l'orologio del client. Era
-- l'unico timestamp del dominio non timbrato dal DB, e l'unico falsificabile:
-- la policy UPDATE (`is_platform_admin()`) autorizza la riga, non i valori
-- delle singole colonne, quindi un platform admin poteva chiudere un ticket
-- datandolo a piacere. Con un trigger diventa un fatto osservato dal DB.
--
-- ── La derivazione e' TOTALE, non condizionale ──────────────────────────────
-- La specifica naturale sarebbe "se lo status entra in closed timbra, se ne
-- esce azzera, se non cambia lascia stare". Implementata alla lettera lascia
-- pero' un buco: su una transizione che non coinvolge 'closed' (es.
-- open → in_progress) nessun ramo tocca NEW.closed_at, e il valore arrivato
-- dal client sopravvive. Sarebbe di nuovo falsificabile, solo per una strada
-- meno ovvia.
--
-- Qui `closed_at` e' invece SEMPRE ricalcolato dallo status, mai letto dal
-- payload. L'invariante che ne esce e' esatta:
--
--     closed_at IS NOT NULL  ⟺  status = 'closed'
--
-- I tre casi richiesti sono coperti, piu' il quarto implicito:
--   entra in closed          → now()
--   resta closed             → OLD.closed_at (l'istante originale, non un
--                              nuovo now() a ogni UPDATE successiva)
--   esce da closed           → NULL
--   non e' e non era closed  → NULL (== OLD, nessun cambiamento osservabile)
--
-- ── SECURITY INVOKER (default), NON DEFINER ─────────────────────────────────
-- Basta, e DEFINER sarebbe privilegio regalato. La funzione non legge e non
-- scrive alcuna tabella: tocca NEW e legge OLD, entrambi gia' in memoria,
-- su una riga che il chiamante sta aggiornando attraverso una UPDATE che RLS
-- ha gia' autorizzato. Non le serve alcun privilegio che il chiamante non
-- abbia. Stessa scelta di support_stamp_ticket_timestamps /
-- support_stamp_message_timestamp (20260827100004).
--
-- Resta DEFINER il solo support_touch_ticket_on_message (20260827100001), che
-- DEVE esserlo perche' scrive su support_tickets, dove il cliente non ha
-- UPDATE.
--
-- ── Interazione con support_touch_ticket_on_message ─────────────────────────
-- Quel trigger e' AFTER INSERT su support_messages e fa una UPDATE sul ticket
-- padre. Quella UPDATE fa scattare ANCHE questo BEFORE UPDATE. Verificati
-- tutti e tre i percorsi, nessuna contraddizione:
--
--   riapertura (messaggio cliente su ticket closed):
--     il vecchio trigger scrive status='open' + closed_at=NULL;
--     questo vede NEW.status='open' → ramo ELSE → NULL. Stesso valore.
--
--   messaggio platform su ticket closed (il ticket NON si riapre):
--     il vecchio scrive status='closed' + closed_at=t.closed_at;
--     questo vede NEW.status='closed' e OLD.status='closed' → ramo 2 →
--     OLD.closed_at. Stesso valore.
--
--   messaggio su ticket gia' aperto:
--     entrambi lasciano closed_at a NULL.
--
-- Conseguenza: la CASE su closed_at dentro support_touch_ticket_on_message e'
-- ora RIDONDANTE — questo trigger produrrebbe lo stesso risultato anche se
-- quella non ci fosse. Non e' contraddittoria e non e' un bug, quindi il file
-- 20260827100001 NON viene toccato. Se un giorno si volesse rimuoverla, va
-- fatto sapendo che l'azzeramento dipenderebbe interamente da qui.
--
-- ── Ordine rispetto a support_tickets_set_updated_at ────────────────────────
-- Sono due BEFORE UPDATE ROW sulla stessa tabella: Postgres li esegue in
-- ordine alfabetico di nome, quindi `support_tickets_derive_closed_at` prima
-- di `support_tickets_set_updated_at`. Irrilevante: scrivono colonne disgiunte
-- (closed_at vs updated_at) e nessuno dei due legge quella dell'altro.
--
-- ACL e CREATE TRIGGER in 20260827130001: `CREATE FUNCTION` +
-- `REVOKE`/`GRANT` nello stesso file fanno fallire `supabase db push` con
-- SQLSTATE 42601 (docs/patterns/storage-sql.md).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.support_derive_closed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
    IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
        -- Entra in chiusura ora.
        NEW.closed_at := now();
    ELSIF NEW.status = 'closed' THEN
        -- Era gia' chiuso e resta chiuso: conserva l'istante della chiusura
        -- originale. Senza questo ramo, ogni UPDATE su un ticket chiuso
        -- (anche solo il tocco di last_message_at da parte di un messaggio
        -- platform) sposterebbe in avanti la data di chiusura.
        NEW.closed_at := OLD.closed_at;
    ELSE
        -- Non e' chiuso: per definizione non ha un istante di chiusura.
        NEW.closed_at := NULL;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.support_derive_closed_at() IS
    'Trigger BEFORE UPDATE su support_tickets: closed_at e'' sempre derivato da status (now() alla chiusura, NULL altrimenti, invariato se resta chiuso), mai letto dal payload del client. Mantiene l''invariante closed_at IS NOT NULL <=> status = ''closed''. SECURITY INVOKER: tocca solo NEW/OLD.';
