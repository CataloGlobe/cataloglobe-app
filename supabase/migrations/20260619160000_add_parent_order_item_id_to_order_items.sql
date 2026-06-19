-- ============================================================
-- Add row-level lineage from a rectification (storno) order_item
-- back to the parent order_item it stornos.
--
-- Context: rectifications link to their parent only at the ORDER level
-- (orders.parent_order_id). Without a row->row reference the cumulative
-- stornato quantity per original line is not reconstructable, which lets
-- repeated partial rectifications overflow the original quantity
-- (over-storno bug, audit Section F). This column closes that gap.
--
-- No backfill: COUNT of existing rectification orders = 0 at apply time
-- (verified: SELECT count(*) FROM orders WHERE is_rectification = true → 0).
-- ============================================================

ALTER TABLE public.order_items
    ADD COLUMN parent_order_item_id uuid NULL
        REFERENCES public.order_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.order_items.parent_order_item_id IS
    'Populated only on rectification (storno) order_items: references the parent order_item row being stornato. NULL on normal order lines. Used to compute the cumulative residual stornabile per line.';

-- Residual queries filter on this column (SUM of stornato qty per parent line).
CREATE INDEX idx_order_items_parent_order_item_id
    ON public.order_items (parent_order_item_id)
    WHERE parent_order_item_id IS NOT NULL;
