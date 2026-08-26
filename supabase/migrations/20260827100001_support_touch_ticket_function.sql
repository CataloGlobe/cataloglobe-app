-- =============================================================================
-- support_touch_ticket_on_message() — trigger AFTER INSERT su support_messages
-- =============================================================================
--
-- Fa due cose sul ticket padre:
--   1. `last_message_at = now()` SEMPRE (ordinamento della coda admin)
--   2. se il messaggio arriva dal cliente e il ticket e' 'closed' →
--      status = 'open', closed_at = NULL  (riapertura automatica)
--
-- ── Perche' un trigger e non logica applicativa ──────────────────────────────
-- Il cliente NON ha permesso di UPDATE su support_tickets: la sola policy
-- UPDATE e' `USING (is_platform_admin())` (20260827100000). Una riapertura
-- fatta dal client fallirebbe silenziosamente (0 righe aggiornate, nessun
-- errore da PostgREST). SECURITY DEFINER gira come owner della tabella —
-- esente da RLS salvo FORCE ROW LEVEL SECURITY — quindi la riapertura avviene
-- server-side, nella stessa transazione dell'INSERT del messaggio: o passano
-- entrambi o non passa nessuno dei due. Nessuna finestra in cui esiste un
-- messaggio del cliente su un ticket rimasto 'closed'.
--
-- ── Superficie di attacco ────────────────────────────────────────────────────
-- SECURITY DEFINER, ma nessun parametro utente entra nel WHERE: il target e'
-- `NEW.ticket_id`, cioe' una riga che l'INSERT policy ha gia' autorizzato.
-- L'unica scrittura possibile e' su tre colonne del ticket padre di quel
-- messaggio, con valori costanti. Non c'e' modo di pilotarla verso un altro
-- ticket ne' di scrivere un valore arbitrario.
--
-- `SET search_path TO ''` + qualifiche public.* esplicite, come da regola.
--
-- ACL e CREATE TRIGGER vivono in 20260827100002: `CREATE FUNCTION` +
-- `REVOKE`/`GRANT` nello stesso file fanno fallire `supabase db push` con
-- SQLSTATE 42601 (docs/patterns/storage-sql.md).
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
        last_message_at = now(),
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
    'Trigger AFTER INSERT su support_messages: aggiorna last_message_at sul ticket padre e riapre il ticket (closed → open) quando il messaggio arriva dal cliente. SECURITY DEFINER perche'' il cliente non ha UPDATE su support_tickets.';
