-- ═══════════════════════════════════════════════════════════════
-- Add CHECK constraints on orders.notes and order_items.item_notes
-- ═══════════════════════════════════════════════════════════════
-- Protects DB integrity from clients that bypass the Edge layer
-- (curl direct → submit-order → submit_order_atomic → orders/order_items).
-- Limits are mirrored client-side (OrderingSheet) and Edge-side
-- (submit-order parser) to fail-fast with friendly error codes.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.orders
ADD CONSTRAINT orders_notes_length
CHECK (notes IS NULL OR length(notes) <= 300);

ALTER TABLE public.order_items
ADD CONSTRAINT order_items_item_notes_length
CHECK (item_notes IS NULL OR length(item_notes) <= 140);

COMMIT;
