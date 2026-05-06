-- Drop and recreate analytics_events.activity_id_fkey with ON DELETE CASCADE.
-- Rationale: analytics_events is ephemeral telemetry; if the activity is
-- deleted, the events lose semantic meaning and should be removed.
-- This aligns with all other 7 FKs on activities.id which already use CASCADE.
-- Bug context: previous NO ACTION caused 23503 errors blocking activity
-- deletion when telemetry rows existed (delete-business edge function 500).

ALTER TABLE public.analytics_events
    DROP CONSTRAINT analytics_events_activity_id_fkey;

ALTER TABLE public.analytics_events
    ADD CONSTRAINT analytics_events_activity_id_fkey
        FOREIGN KEY (activity_id)
        REFERENCES public.activities(id)
        ON DELETE CASCADE;
