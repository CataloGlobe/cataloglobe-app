-- =============================================================================
-- print_jobs — colonna kind (comanda | annullo)
-- =============================================================================
--
-- Blocco 3a: il ticket di annullamento e' un secondo tipo di job sulla stessa
-- coda print_jobs. Un ordine annullato dopo essere gia' stato stampato produce
-- un job 'annullo' verso le stesse stampanti, in aggiunta (mai in sostituzione)
-- all'eventuale job 'comanda' gia' presente per quella coppia (order_id,
-- printer_id) — da qui la necessita' di includere kind nella UNIQUE.
--
-- Default 'comanda' su NOT NULL: le righe esistenti (blocco 1/2) restano
-- coerenti senza backfill, nessun job pre-esistente e' mai stato un annullo.
-- =============================================================================

ALTER TABLE public.print_jobs
    ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'comanda';

ALTER TABLE public.print_jobs
    DROP CONSTRAINT IF EXISTS print_jobs_kind_check;
ALTER TABLE public.print_jobs
    ADD CONSTRAINT print_jobs_kind_check CHECK (kind IN ('comanda', 'annullo'));

ALTER TABLE public.print_jobs
    DROP CONSTRAINT IF EXISTS print_jobs_order_printer_key;
ALTER TABLE public.print_jobs
    DROP CONSTRAINT IF EXISTS print_jobs_order_printer_kind_key;
ALTER TABLE public.print_jobs
    ADD CONSTRAINT print_jobs_order_printer_kind_key UNIQUE (order_id, printer_id, kind);

COMMENT ON COLUMN public.print_jobs.kind IS
    'Tipo di documento da stampare: ''comanda'' (ordine inviato in cucina, percorso inline) o ''annullo'' (ticket corto quando un ordine gia'' stampato viene cancellato, SOLO via sweeper — mai inline, vedi _shared/printJobs.ts). Parte della UNIQUE (order_id, printer_id, kind): un ordine puo'' avere sia una comanda che un annullo verso la stessa stampante.';
