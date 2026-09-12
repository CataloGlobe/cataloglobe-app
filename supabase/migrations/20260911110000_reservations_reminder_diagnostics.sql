-- =============================================================================
-- Promemoria prenotazione: diagnostica del tentativo, accanto all'esito.
-- =============================================================================
--
-- Il 09/09 il claim atomico del promemoria (`UPDATE ... WHERE reminder_sent_at
-- IS NULL`) ha ricevuto un 504 Gateway Timeout dal gateway PostgREST. Il codice
-- ha incrementato un contatore in memoria, scritto una riga di console.log e
-- proseguito. Il cron gira una volta al giorno: quel promemoria e' andato perso
-- per sempre, e l'unica traccia e' scaduta con la ritenzione dei log.
--
-- Queste tre colonne mettono il TENTATIVO nel database, accanto all'ESITO che
-- gia' c'era. `reminder_sent_at` risponde a "e' partito?"; da sole, le righe
-- rimaste a NULL non sanno distinguere "non era un candidato" da "ci abbiamo
-- provato tre volte e non ce l'abbiamo fatta".
--
-- ── Cosa NON cambia ─────────────────────────────────────────────────────────
-- `reminder_sent_at` resta il lucchetto contro il doppio invio, con la stessa
-- semantica descritta in 20260829120000. L'indice parziale
-- `idx_reservations_reminder_pending` resta identico: il predicato del claim non
-- si tocca, e aggiungere queste colonne alla WHERE lo renderebbe un altro claim.
--
-- Nessuno scrive ancora qui: il codice della Edge Function arriva dopo. Fino ad
-- allora sono tre colonne a zero e a NULL, inerti per definizione.
--
-- Nessun impatto su RLS: colonne su una tabella gia' protetta dalle policy
-- esistenti, scritte dall'edge function con service_role.
-- =============================================================================

BEGIN;

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS reminder_attempts int NOT NULL DEFAULT 0;

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS reminder_failed_at timestamptz NULL;

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS reminder_last_error text NULL;

COMMENT ON COLUMN public.reservations.reminder_attempts IS
    'Quante volte si e'' tentato di inviare il promemoria, riusciti e falliti. 0 = mai tentato, che su una prenotazione passata significa che non era un candidato (non confermata, sede spenta, tenant fuori abbonamento). Non si azzera.';

COMMENT ON COLUMN public.reservations.reminder_failed_at IS
    'Quando e'' fallito l''ULTIMO tentativo. NULL non significa "riuscito": significa "mai fallito" — e su una riga con reminder_sent_at NULL significa che non e'' mai stata un candidato. Un valore qui insieme a reminder_sent_at valorizzato descrive un invio riuscito dopo un fallimento precedente.';

COMMENT ON COLUMN public.reservations.reminder_last_error IS
    'Motivo in chiaro dell''ULTIMO fallimento (es. "Gateway Timeout" sul claim). Sovrascritto a ogni nuovo tentativo fallito: e'' l''ultimo stato, non uno storico. NULL = nessun fallimento registrato. Mai dati del cliente qui dentro.';

COMMIT;
