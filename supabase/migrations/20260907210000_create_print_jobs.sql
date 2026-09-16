-- =============================================================================
-- print_jobs — coda di stampa comande (Sunmi cloud printer)
-- =============================================================================
--
-- Una riga = "questa comanda (order) va stampata su questa stampante
-- (printer)". Creata in modo sincrono da submit-order / submit-order-admin
-- subito dopo il commit dell'ordine; la chiamata a Sunmi parte in background
-- (EdgeRuntime.waitUntil) e aggiorna lo stato. Se il push inline fallisce (rete,
-- stampante offline, edge morta), il job resta recuperabile e lo sweeper
-- `process-print-jobs` (pg_cron, ogni minuto) lo riprende.
--
-- ── Perche' una tabella e non solo il push inline ───────────────────────────
-- Il push verso Sunmi e' best-effort e NON deve mai bloccare il 201 al cliente.
-- Senza coda, un fallimento inline = comanda persa in silenzio. Con la coda:
-- retry idempotente (trade_no univoco per (ordine, stampante), Sunmi rifiuta i
-- duplicati con 10071705 che trattiamo come successo), cap poison su
-- `attempts`, osservabilita' via `last_error`.
--
-- ── Cardinalita' ────────────────────────────────────────────────────────────
--   * UNIQUE (order_id, printer_id): un ordine produce AL PIU' un job per
--     stampante. Il replay idempotente di submit-order non inserisce (guard
--     applicativa su idempotent_replay + questo vincolo come rete di sicurezza).
--   * `activity_id` denormalizzato da orders: serve alla RLS (has_permission
--     e' activity-scoped) e a futuri filtri dello sweeper, senza JOIN.
--   * FK `order_id` ON DELETE CASCADE: eliminato l'ordine (purge tenant),
--     spariscono i job. FK `printer_id` ON DELETE CASCADE: scollegata la
--     stampante, i job pendenti verso di lei non hanno piu' senso.
--
-- ── Stati ───────────────────────────────────────────────────────────────────
--   pending    → in attesa di un worker (inline o sweeper)
--   processing → preso in carico (claimed_at valorizzato); se resta qui oltre
--                la soglia di reclaim, lo sweeper lo riprende (orfano)
--   done       → Sunmi ha accettato il contenuto (code 1 o 10071705)
--   failed     → esauriti i tentativi (cap poison in claim_pending_print_jobs)
--
-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Sola lettura per chi puo' leggere gli ordini della sede:
--   has_permission('orders.read', activity_id).
-- NESSUNA policy di INSERT/UPDATE/DELETE: la scrittura passa esclusivamente
-- dalle edge function con service_role (bypass RLS).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.print_jobs (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    activity_id   uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    printer_id    uuid NOT NULL REFERENCES public.printers(id) ON DELETE CASCADE,
    trade_no      text NOT NULL,
    status        text NOT NULL DEFAULT 'pending',
    attempts      integer NOT NULL DEFAULT 0,
    last_error    text NULL,
    claimed_at    timestamptz NULL,
    processed_at  timestamptz NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT print_jobs_status_check
        CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    CONSTRAINT print_jobs_attempts_nonneg CHECK (attempts >= 0),
    CONSTRAINT print_jobs_trade_no_not_empty CHECK (length(trim(trade_no)) > 0),
    CONSTRAINT print_jobs_order_printer_key UNIQUE (order_id, printer_id)
);

COMMENT ON TABLE public.print_jobs IS
    'Coda di stampa comande verso stampanti cloud Sunmi. Un job per (ordine, stampante). Scritta solo da service_role (submit-order, submit-order-admin, process-print-jobs).';
COMMENT ON COLUMN public.print_jobs.trade_no IS
    'Identificativo idempotente inviato a Sunmi (pushContent): 28 hex di order_id + 4 hex di printer_id (32 = max Sunmi). Univoco per (ordine, stampante): Sunmi deduplica per shop e le stampanti di una sede condividono lo shop_id. Sunmi risponde 10071705 sui duplicati: trattato come successo.';
COMMENT ON COLUMN public.print_jobs.activity_id IS
    'Denormalizzato da orders.activity_id per RLS activity-scoped e filtri sweeper senza JOIN.';
COMMENT ON COLUMN public.print_jobs.claimed_at IS
    'Istante dell''ultima presa in carico. Un processing con claimed_at oltre la soglia di reclaim e'' un orfano e viene ripreso dallo sweeper.';

-- Indici per lo sweeper: coda FIFO dei pending + scansione orfani processing.
CREATE INDEX IF NOT EXISTS idx_print_jobs_pending
    ON public.print_jobs (status, created_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_print_jobs_processing_claimed
    ON public.print_jobs (claimed_at)
    WHERE status = 'processing';

-- Lookup per ordine (drawer dettaglio / debug) e per stampante.
CREATE INDEX IF NOT EXISTS idx_print_jobs_order_id   ON public.print_jobs (order_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_printer_id ON public.print_jobs (printer_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_activity_id ON public.print_jobs (activity_id);

-- Trigger updated_at — riusa public.set_updated_at() (gia' presente nello schema)
DROP TRIGGER IF EXISTS set_updated_at_print_jobs ON public.print_jobs;
CREATE TRIGGER set_updated_at_print_jobs
    BEFORE UPDATE ON public.print_jobs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS — sola lettura, activity-scoped ─────────────────────────────────────
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Roles can read print_jobs" ON public.print_jobs;
CREATE POLICY "Roles can read print_jobs"
    ON public.print_jobs FOR SELECT TO authenticated
    USING (public.has_permission('orders.read', activity_id));

-- Nessuna policy INSERT/UPDATE/DELETE: scrittura solo via service_role.
