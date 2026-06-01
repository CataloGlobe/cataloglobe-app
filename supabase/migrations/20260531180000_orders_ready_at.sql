-- Step 3.5: add 'ready' status + ready_at timestamp on orders.
--
-- Prepares schema for Step 4 (admin kanban with 3 active columns:
-- submitted -> acknowledged -> ready -> delivered). The mark-order-ready
-- Edge Function (mirror 1:1 of acknowledge-order) will land in Step 4.
--
-- Schema only: NO transition logic, NO RLS change (admin transitions go
-- through Edge Functions, not direct UPDATE), NO speculative index.

-- 1. Add ready_at timestamp (NULL until transition acknowledged -> ready).
ALTER TABLE public.orders
    ADD COLUMN ready_at timestamptz NULL;

-- 2. Extend status CHECK constraint to accept 'ready'.
ALTER TABLE public.orders
    DROP CONSTRAINT orders_status_check;

ALTER TABLE public.orders
    ADD CONSTRAINT orders_status_check
    CHECK (status = ANY (ARRAY['submitted', 'acknowledged', 'ready', 'delivered', 'cancelled']));
