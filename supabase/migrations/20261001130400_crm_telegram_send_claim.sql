-- =============================================================================
-- CRM interno (Fase 0): un invio Telegram si prenota prima di partire
-- =============================================================================
-- crm-notify gira ogni minuto; un giro lento (molti destinatari, timeout di
-- Telegram) può accavallarsi col successivo e mandare due volte lo stesso
-- messaggio. Ora la riga di `crm_telegram_messages` si inserisce PRIMA
-- dell'invio con `message_id` nullo: la UNIQUE (lead, utente, tipo) fa vincere
-- un solo giro. Dopo l'invio si scrive il message_id; se l'invio fallisce la
-- riga si toglie. Le righe ancora senza message_id sono invii in corso (o di
-- un giro caduto: crm-notify le libera dopo 5 minuti) e la riscrittura dei
-- messaggi le salta.
--
-- Inoltre: niente INSERT/UPDATE/DELETE per authenticated (finora bloccati
-- solo dall'assenza di policy).
-- =============================================================================

BEGIN;

ALTER TABLE public.crm_telegram_messages ALTER COLUMN message_id DROP NOT NULL;

REVOKE ALL ON TABLE public.crm_telegram_messages FROM authenticated;
GRANT SELECT ON TABLE public.crm_telegram_messages TO authenticated;

COMMIT;
