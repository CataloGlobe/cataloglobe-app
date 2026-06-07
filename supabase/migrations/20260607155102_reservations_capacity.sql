-- =========================================
-- RESERVATIONS — Capacity foundation (Step 1)
-- =========================================
-- Adds per-activity capacity configuration columns so the booking engine
-- can refuse online submissions when the venue would go over capacity.
-- Step 1 only implements the "continua + manuale" path (matrix row
-- "manuale" of the intake matrix). The auto-confirm and shift-based
-- columns default to safe values and remain wired-up later.
--
-- Defaults are chosen so that EVERY existing activity remains in its
-- current behavior:
--   - reservation_capacity = NULL              → no capacity gate (today's
--                                                behavior)
--   - reservation_duration_minutes = 120       → admin aggregate widget
--                                                falls back to 120 (matches
--                                                the previous ±90 heuristic
--                                                within an order of magnitude)
--   - reservation_availability_mode = 'continua'
--   - reservation_confirmation_mode = 'manuale'
--   - reservation_overbooking_form = 'hard'    → when a capacity is set
--                                                later, the safe default is
--                                                to block over-capacity.
--
-- The CHECK `activities_auto_requires_capacity` enforces an integrity
-- invariant: you cannot switch to auto-confirm without a capacity, since
-- there's nothing for the engine to gate against. Manuale is the V0 path
-- so existing rows trivially satisfy it.
--
-- An index supports the engine's hot query: "all non-terminal reservations
-- of an activity on a given date". Partial on the active statuses so the
-- index stays compact (declined/cancelled rows are excluded by the engine
-- anyway).

BEGIN;

ALTER TABLE public.activities
    ADD COLUMN reservation_capacity int NULL
        CHECK (reservation_capacity IS NULL OR reservation_capacity > 0),
    ADD COLUMN reservation_duration_minutes int NOT NULL DEFAULT 120
        CHECK (reservation_duration_minutes BETWEEN 15 AND 600),
    ADD COLUMN reservation_availability_mode text NOT NULL DEFAULT 'continua'
        CHECK (reservation_availability_mode IN ('turni','continua')),
    ADD COLUMN reservation_confirmation_mode text NOT NULL DEFAULT 'manuale'
        CHECK (reservation_confirmation_mode IN ('manuale','auto')),
    ADD COLUMN reservation_overbooking_form text NOT NULL DEFAULT 'hard'
        CHECK (reservation_overbooking_form IN ('hard','soft'));

ALTER TABLE public.activities
    ADD CONSTRAINT activities_auto_requires_capacity CHECK (
        reservation_confirmation_mode = 'manuale'
        OR reservation_capacity IS NOT NULL
    );

CREATE INDEX idx_reservations_activity_date_active
    ON public.reservations (activity_id, reservation_date)
    WHERE status IN ('pending','confirmed');

COMMIT;
