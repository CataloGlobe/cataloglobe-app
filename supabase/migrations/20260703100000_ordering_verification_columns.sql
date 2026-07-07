-- First-order verification model. See docs/orders-architecture + FASE 2 plan.
BEGIN;

ALTER TABLE public.activities
    ADD COLUMN ordering_verification_mode TEXT NOT NULL DEFAULT 'first_order'
    CHECK (ordering_verification_mode IN ('none', 'first_order'));
COMMENT ON COLUMN public.activities.ordering_verification_mode IS
  'Table-presence verification for QR ordering. first_order = first staff acknowledge verifies the group; none = groups verified on creation. Enum extensible via future migration.';

ALTER TABLE public.order_groups
    ADD COLUMN verified_at TIMESTAMPTZ NULL;
COMMENT ON COLUMN public.order_groups.verified_at IS
  'Set when the group is proven present (first order acknowledged, mode=first_order) or at creation (mode=none). NULL = unverified: orders cannot advance past acknowledged.';

-- Backward compat: every pre-existing group is considered verified so in-flight
-- tables are not blocked at rollout (plan risk #3).
UPDATE public.order_groups SET verified_at = created_at WHERE verified_at IS NULL;

COMMIT;
