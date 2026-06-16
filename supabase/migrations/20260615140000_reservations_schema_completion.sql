-- Reservations schema completion (table currently empty).
--
-- Adds the columns/values needed to later collect richer reservation metrics:
--   * status gains 'seated' | 'no_show' | 'completed'  → enables no-show tracking
--     and the seated→completed lifecycle.
--   * seated_at / completed_at                          → enable turn-time
--     (completed_at - seated_at).
--   * table_id (FK → public.tables, ON DELETE SET NULL) → enables table
--     utilization / capacity analytics (tables already carries `seats`/`zone_id`).
--
-- SCOPE: schema only. State transitions, flow actions (respond-reservation edge +
-- ReservationsInbox UI) and analytics_reservations_* RPCs are intentionally NOT
-- included here — they will be added separately once there is reservation volume.
-- Extending the status CHECK is inert until the corresponding flow actions exist
-- (transitions are validated in application code, not by the CHECK).
--
-- ALTER TABLE only — no GRANT/REVOKE, safe for `supabase db push`.

-- 1. Extend status CHECK to the 7 lifecycle values (default stays 'pending').
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_status_check;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'confirmed'::text,
    'declined'::text,
    'cancelled'::text,
    'seated'::text,
    'no_show'::text,
    'completed'::text
  ]));

-- 2. Turn-time timestamps.
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS seated_at timestamptz NULL;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;

-- 3. Table assignment (table utilization). ON DELETE SET NULL: removing a table
-- must not delete reservation history.
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS table_id uuid NULL REFERENCES public.tables(id) ON DELETE SET NULL;
