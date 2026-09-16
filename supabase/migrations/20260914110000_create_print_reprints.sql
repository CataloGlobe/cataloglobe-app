-- =============================================================================
-- print_reprints — ristampe manuali della comanda (Sunmi cloud printer)
-- =============================================================================
--
-- Una riga = "l'operatore ha chiesto di ristampare questo ordine su questa
-- stampante, in questo momento". Ogni click e' una riga nuova: a differenza
-- di `print_jobs`, QUI non esiste un vincolo UNIQUE su (order_id, printer_id)
-- perche' e' l'esatto contrario di quel che print_jobs garantisce. print_jobs
-- e' una coda con retry pensata perche' la comanda automatica non esca due
-- volte; una ristampa manuale e' un'azione umana e deve poter uscire tante
-- volte quante l'operatore la richiede.
--
-- ── Perche' una tabella separata e non un nuovo kind in print_jobs ─────────
-- print_jobs.trade_no e' derivato deterministicamente da (order_id,
-- printer_id, kind) — vedi tradeNoFor() in _shared/printJobs.ts — apposta per
-- essere idempotente: lo stesso trade_no inviato due volte a Sunmi risponde
-- 10071705 e viene trattato come successo, cioe' la seconda stampa NON esce.
-- Forzare la ristampa dentro quello schema (stesso kind + reset a pending)
-- avrebbe richiesto un trade_no non derivato dai dati, e avrebbe sovrascritto
-- attempts/processed_at della comanda originale, perdendo lo storico di
-- quando e' uscita la prima volta. Una tabella propria evita entrambi i
-- problemi: trade_no casuale per riga, nessun campo condiviso da sovrascrivere.
--
-- ── Nessun retry automatico ──────────────────────────────────────────────
-- Lo sweeper `process-print-jobs` NON legge questa tabella. Se una ristampa
-- non esce, l'operatore la richiede di nuovo: e' gia' un'azione manuale
-- ripetibile a piacere, non serve un cron che la riprovi da solo. Scelta
-- deliberata, non una dimenticanza.
--
-- ── Cardinalita' ────────────────────────────────────────────────────────────
--   * Nessun UNIQUE su (order_id, printer_id): e' il punto della tabella.
--   * `activity_id` denormalizzato da orders, come in print_jobs: serve alla
--     RLS (has_permission e' activity-scoped) senza JOIN.
--   * FK `order_id` ON DELETE CASCADE, FK `printer_id` ON DELETE CASCADE:
--     stesso comportamento di print_jobs.
--
-- ── Stati ───────────────────────────────────────────────────────────────────
--   done    → Sunmi ha accettato il contenuto (code 1; 10071705 non puo'
--             capitare qui perche' trade_no e' casuale per riga)
--   failed  → Sunmi ha rifiutato o non era raggiungibile. Nessun retry: resta
--             cosi', l'operatore vede l'errore e ripete l'azione se vuole.
--
-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Sola lettura per chi puo' leggere gli ordini della sede:
--   has_permission('orders.read', activity_id).
-- NESSUNA policy di INSERT/UPDATE/DELETE: la scrittura passa esclusivamente
-- dalla edge function `sunmi-reprint-order` con service_role.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.print_reprints (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    activity_id   uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    printer_id    uuid NOT NULL REFERENCES public.printers(id) ON DELETE CASCADE,
    trade_no      text NOT NULL,
    status        text NOT NULL,
    last_error    text NULL,
    requested_by  uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT print_reprints_status_check
        CHECK (status IN ('done', 'failed')),
    CONSTRAINT print_reprints_trade_no_not_empty CHECK (length(trim(trade_no)) > 0)
);

COMMENT ON TABLE public.print_reprints IS
    'Storico delle ristampe manuali della comanda verso stampanti cloud Sunmi. Una riga per ogni richiesta (nessun UNIQUE su order_id+printer_id: e'' voluto, vedi header). Nessun retry automatico. Scritta solo da service_role (sunmi-reprint-order).';
COMMENT ON COLUMN public.print_reprints.trade_no IS
    'Identificativo Sunmi generato casualmente per questa riga (NON derivato da order_id/printer_id come in print_jobs): ogni ristampa deve poter uscire di nuovo, mai deduplicata da Sunmi.';
COMMENT ON COLUMN public.print_reprints.activity_id IS
    'Denormalizzato da orders.activity_id per RLS activity-scoped, senza JOIN.';
COMMENT ON COLUMN public.print_reprints.requested_by IS
    'Utente admin che ha richiesto la ristampa (auth.users.id). Nullable: resta NULL se l''utente viene eliminato (ON DELETE SET NULL) — lo storico della ristampa non deve bloccare delete-account/purge-accounts.';

CREATE INDEX IF NOT EXISTS idx_print_reprints_order_id    ON public.print_reprints (order_id);
CREATE INDEX IF NOT EXISTS idx_print_reprints_activity_id ON public.print_reprints (activity_id);

-- ── RLS — sola lettura, activity-scoped ─────────────────────────────────────
ALTER TABLE public.print_reprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Roles can read print_reprints" ON public.print_reprints;
CREATE POLICY "Roles can read print_reprints"
    ON public.print_reprints FOR SELECT TO authenticated
    USING (public.has_permission('orders.read', activity_id));

-- Nessuna policy INSERT/UPDATE/DELETE: scrittura solo via service_role.
