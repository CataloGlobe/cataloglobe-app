-- =============================================================================
-- Stato dispositivo Sunmi via callback — colonne su printers + idempotenza.
-- =============================================================================
--
-- Sunmi manda in push 4 tipi di evento (Sunmi-NotifyType / report_type nel
-- body), gestiti dall'edge function sunmi-device-callback:
--   1 basic info    — ignorato (nessuna colonna dedicata)
--   2 status info   — contatori cumulativi (lack_paper_count, ecc.)
--   3 timing info   — ignorato (nessuna colonna dedicata)
--   4 online info   — action 1/2 (online/offline) + timestamp del cambio
--
-- ── `lack_paper_count` / `paper_will_end_count` sono CONTATORI, non stati ──
-- Il campo Sunmi dice "quante volte e' mancata la carta da sempre", non "manca
-- adesso". Non torna mai indietro. Per dedurre "manca ORA" confrontiamo il
-- valore appena arrivato con l'ultimo persistito: se e' aumentato, e' appena
-- successo → accendiamo `out_of_paper`. Se `lack_paper_count` e' NULL (nessun
-- evento mai ricevuto per questa stampante), il primo evento in arrivo serve
-- SOLO a inizializzare il valore di riferimento: non deve accendere l'avviso,
-- altrimenti qualunque stampante che abbia mai finito la carta in vita sua
-- (quasi tutte, nel tempo) lo accenderebbe al primo callback ricevuto.
--
-- `out_of_paper` si spegne quando una stampa va a buon fine (vedi
-- _shared/printJobs.ts, _dispatchInline): se la comanda esce, la carta c'e'.
--
-- ── NON VERIFICATO SUL CAMPO (2026-09-14) ──────────────────────────────────
-- Prova con stampante fisicamente senza carta, LED rosso acceso, lavori in
-- coda: NESSUN evento report_type=2 e' arrivato. `lack_paper_count' e'
-- rimasto a 0. L'evento online/offline (report_type=4), invece, e' stato
-- verificato e funziona (spegnimento/riaccensione → callback quasi
-- immediato, is_online/last_online_at aggiornati correttamente).
-- La struttura resta quindi in attesa di capire in quali condizioni Sunmi
-- incrementi davvero `lack_paper_count`/`paper_will_end_count` (al
-- tentativo di stampa fallito? solo al ripristino? con ritardo/batching
-- diverso da online/offline?) — nessuna di queste ipotesi e' confermata.
-- Nel frattempo la mancanza di carta e' segnalata SOLO dal LED rosso sul
-- dispositivo: `out_of_paper` in UI non si accende su questo scenario reale.
--
-- `paper_will_end_count` e' persistito per completezza/debug ma non pilota
-- nulla in UI: un avviso preventivo che non sappiamo spegnere con precisione
-- resterebbe acceso per giorni e diventerebbe rumore (vedi doc implementazione).
--
-- `is_online` / `last_online_at`: letti dal badge della Card Stampanti al
-- posto della chiamata on-demand a ogni apertura. `last_online_at` esisteva
-- gia' (mai popolata finora) — da questa migration in poi la scrive il
-- callback quando arriva un evento report_type=4 con action=1.
-- Il pulsante "Aggiorna stato" (fetchPrintersStatus, on-demand, non
-- persistito) resta invariato: e' il fallback se una notifica si perde.
-- =============================================================================

BEGIN;


-- =============================================================================
-- STEP 1 — colonne su printers
-- =============================================================================

ALTER TABLE public.printers
    ADD COLUMN is_online             boolean     NULL,
    ADD COLUMN lack_paper_count      integer     NULL,
    ADD COLUMN paper_will_end_count  integer     NULL,
    ADD COLUMN out_of_paper          boolean     NOT NULL DEFAULT false,
    ADD COLUMN last_status_at        timestamptz NULL;

COMMENT ON COLUMN public.printers.is_online IS
    'Stato online persistito dal callback Sunmi (report_type=4, action 1/2). NULL = nessun evento mai ricevuto per questo dispositivo, diverso da offline. Letto dal badge invece di chiamare Sunmi a ogni apertura della Card Stampanti.';
COMMENT ON COLUMN public.printers.lack_paper_count IS
    'Ultimo valore visto di device_status_data.lack_paper_count (contatore CUMULATIVO "quante volte e'' mancata la carta", non uno stato). Persistito per confrontare il prossimo evento: un incremento accende out_of_paper. NULL finche'' non arriva il primo evento report_type=2 per questa stampante — il primo evento inizializza il valore senza accendere l''avviso. NON VERIFICATO SUL CAMPO (2026-09-14): con stampante fisicamente senza carta e lavori in coda, nessun evento report_type=2 e'' arrivato, il valore e'' rimasto fermo. In attesa di capire in quali condizioni Sunmi lo incrementi davvero.';
COMMENT ON COLUMN public.printers.paper_will_end_count IS
    'Ultimo valore visto di device_status_data.paper_will_end_count ("carta in esaurimento", anch''esso un contatore cumulativo). Persistito per completezza/debug, non pilota nessun avviso in UI: la granularita'' preventiva non e'' spegnibile con precisione e diventerebbe rumore. Stesso "non verificato sul campo" di lack_paper_count.';
COMMENT ON COLUMN public.printers.out_of_paper IS
    'Avviso "carta finita" acceso quando lack_paper_count e'' arrivato incrementato rispetto al valore persistito. Si spegne alla prima stampa riuscita su questa stampante (vedi _shared/printJobs.ts). NON VERIFICATO SUL CAMPO (2026-09-14): prova con stampante scarica e lavori in coda non ha mai acceso questo avviso, perche'' non e'' arrivato nessun evento report_type=2 da confrontare. Nel frattempo la mancanza di carta e'' segnalata solo dal LED rosso sul dispositivo, non da questa colonna.';
COMMENT ON COLUMN public.printers.last_status_at IS
    'Ultimo istante in cui un callback Sunmi (report_type 2 o 4) ha aggiornato questa riga. Diagnostico: permette di vedere se i callback hanno smesso di arrivare per un dispositivo.';


-- =============================================================================
-- STEP 2 — sunmi_callback_events: idempotenza sul modello di
-- stripe_processed_events (20260428100000_stripe_webhook_hardening.sql).
-- =============================================================================
--
-- Sunmi ritenta la notifica se la risposta non e' esattamente "SUCCESS"
-- (politica di retry non documentata su numero/intervallo). La chiave naturale
-- della notifica non e' un id singolo come in Stripe: e' la quadrupla
-- (sn, notify_type, timestamp, nonce) che compare nell'header di ogni
-- callback — stessa quadrupla, stesso evento.

CREATE TABLE public.sunmi_callback_events (
    sn              text        NOT NULL,
    notify_type     text        NOT NULL,
    sunmi_timestamp text        NOT NULL,
    sunmi_nonce     text        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz NULL,
    PRIMARY KEY (sn, notify_type, sunmi_timestamp, sunmi_nonce)
);

COMMENT ON TABLE public.sunmi_callback_events IS
    'Idempotency log per sunmi-device-callback. INSERT prima del dispatch, completed_at scritto dopo il successo (stesso pattern di stripe_processed_events): un retry con la stessa quadrupla sn+notify_type+timestamp+nonce trovata gia'' completata risponde SUCCESS senza ri-applicare l''update su printers.';

ALTER TABLE public.sunmi_callback_events ENABLE ROW LEVEL SECURITY;

-- Nessuna policy: solo service_role accede (bypassa RLS) — stesso perimetro
-- di stripe_processed_events. Il frontend non deve mai leggere questa tabella.

CREATE INDEX sunmi_callback_events_created_at_idx
    ON public.sunmi_callback_events (created_at);


-- =============================================================================
-- STEP 3 — purge_sunmi_callback_events: daily retention cron sullo stesso
-- modello di purge_stripe_processed_events (20260619150000). Le righe
-- servono solo finche' Sunmi potrebbe ritentare la stessa notifica; la
-- politica di retry non e' documentata su numero/intervallo (vedi commento
-- sopra), quindi si usa la stessa finestra di 30 giorni dello Stripe
-- idempotency log — ampiamente sufficiente per qualunque retry realistico.
-- Idempotente: unschedule-then-(re)schedule, nessun helper SECURITY DEFINER
-- necessario perche' lo statement non porta logica applicativa.
-- Orario 03:41 (off-peak, minuto dispari per non collidere con gli altri
-- cron giornalieri: 03:00, 03:17, 03:29, 04:00).
-- =============================================================================

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'purge_sunmi_callback_events';

SELECT cron.schedule(
    'purge_sunmi_callback_events',
    '41 3 * * *',
    $$
        DELETE FROM public.sunmi_callback_events
        WHERE created_at < now() - interval '30 days';
    $$
);


-- =============================================================================
-- STEP 4 — Validation
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'printers' AND column_name = 'out_of_paper'
    ) THEN
        RAISE EXCEPTION 'printers.out_of_paper missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname = 'sunmi_callback_events'
          AND relnamespace = 'public'::regnamespace
          AND relrowsecurity = true
    ) THEN
        RAISE EXCEPTION 'sunmi_callback_events missing or RLS disabled';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'purge_sunmi_callback_events'
    ) THEN
        RAISE EXCEPTION 'purge_sunmi_callback_events cron job missing';
    END IF;

    RAISE NOTICE 'Migration printer_device_status applied successfully';
END $$;


COMMIT;
