-- =============================================================================
-- support_touch_ticket_on_message() — aggiunta di last_message_kind
-- =============================================================================
--
-- Rimpiazza il corpo definito in 20260827100001. Quel file NON viene toccato
-- (le migration applicate sono immutabili): questa e' una `CREATE OR REPLACE`
-- successiva, e chi legge la storia vede prima la versione originale e poi
-- questa.
--
-- ── Cosa cambia ─────────────────────────────────────────────────────────────
-- Una riga in piu' nella stessa `SET`: `last_message_kind = NEW.author_kind`.
-- Il resto e' identico, compresa la riapertura del ticket chiuso su messaggio
-- del cliente. Nessun costo aggiuntivo: e' la stessa UPDATE, sulla stessa
-- riga, nella stessa transazione dell'INSERT del messaggio.
--
-- Il valore arriva da `NEW.author_kind`, che le due policy INSERT disgiunte su
-- `support_messages` hanno gia' legato all'identita' del chiamante
-- (20260827100000): un cliente non puo' inserire 'platform' e viceversa.
-- Quindi la colonna denormalizzata eredita quella garanzia — non e' un dato
-- che il client possa scegliere.
--
-- ── ACL ─────────────────────────────────────────────────────────────────────
-- Nessun REVOKE/GRANT in questo file, per due motivi: `CREATE FUNCTION` +
-- `REVOKE` insieme fanno fallire `supabase db push` con SQLSTATE 42601
-- (docs/patterns/storage-sql.md), e soprattutto non servono — `CREATE OR
-- REPLACE FUNCTION` conserva le ACL esistenti, gia' impostate in
-- 20260827100002 (revocata da PUBLIC, anon, authenticated).
--
-- ── SECURITY DEFINER, invariato ─────────────────────────────────────────────
-- Resta necessario: la funzione scrive su `support_tickets`, dove il cliente
-- non ha UPDATE. Nessun parametro utente entra nel WHERE (il target e'
-- `NEW.ticket_id`, riga gia' autorizzata dalla INSERT policy del messaggio) e
-- le colonne scritte restano quattro, tutte con valori derivati e non
-- arbitrari.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.support_touch_ticket_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    -- Nella lista SET, `t.status` / `t.closed_at` a destra sono i valori
    -- PRE-update: la CASE decide sulla base dello stato attuale del ticket,
    -- non di quello che sta scrivendo.
    UPDATE public.support_tickets t
    SET
        last_message_at   = now(),
        -- Da quale lato arriva l'ultimo messaggio. Alimenta il segnale
        -- "risposta non letta" insieme a customer_last_read_at
        -- (20260827140000), che senza questo dato non saprebbe distinguere una
        -- risposta della piattaforma dall'ultimo messaggio del cliente stesso.
        last_message_kind = NEW.author_kind,
        status = CASE
            WHEN NEW.author_kind = 'customer' AND t.status = 'closed'
                THEN 'open'
            ELSE t.status
        END,
        closed_at = CASE
            WHEN NEW.author_kind = 'customer' AND t.status = 'closed'
                THEN NULL
            ELSE t.closed_at
        END
    WHERE t.id = NEW.ticket_id;

    -- AFTER trigger: il valore di ritorno viene ignorato.
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.support_touch_ticket_on_message() IS
    'Trigger AFTER INSERT su support_messages: aggiorna last_message_at e last_message_kind sul ticket padre e riapre il ticket (closed → open) quando il messaggio arriva dal cliente. SECURITY DEFINER perche'' il cliente non ha UPDATE su support_tickets.';
