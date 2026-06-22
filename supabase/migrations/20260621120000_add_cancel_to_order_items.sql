-- ============================================================
-- Per-item soft-cancel ("Annulla articolo") on order_items.
--
-- Pre-service flow (FASE 2b): an article on a non-served order
-- (submitted | acknowledged | ready) can be cancelled WITHOUT creating a
-- rectification (storno). This is an operational removal, not an accounting
-- entry: the cancelled line is excluded from the order total and from the
-- "to prepare" set. No negative line is created.
--
-- Distinct from order-level cancellation (orders.cancelled_at) and from
-- rectification (separate orders row). These two columns live on the
-- INDIVIDUAL line.
-- ============================================================

ALTER TABLE public.order_items
    ADD COLUMN cancelled_at  timestamptz NULL,
    ADD COLUMN cancel_reason text        NULL;

COMMENT ON COLUMN public.order_items.cancelled_at IS
    'Set when a line is cancelled pre-service ("Annulla articolo"): excluded from the order total and from preparation. NULL = active line. Not a rectification (no storno row, no accounting entry).';

COMMENT ON COLUMN public.order_items.cancel_reason IS
    'Optional free-text reason captured when the line was cancelled pre-service. NULL = active line or no reason given.';

-- The cancel RPC counts the remaining ACTIVE lines per order
-- (WHERE order_id = ? AND cancelled_at IS NULL) to decide whether the whole
-- order auto-cancels; a partial index over active lines serves that probe.
CREATE INDEX idx_order_items_active_by_order
    ON public.order_items (order_id)
    WHERE cancelled_at IS NULL;
