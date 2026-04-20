-- Aggiunge flag orari notturni
ALTER TABLE activity_hours
  ADD COLUMN IF NOT EXISTS closes_next_day BOOLEAN NOT NULL DEFAULT false;

-- Rimuovi il CHECK esistente
ALTER TABLE activity_hours
  DROP CONSTRAINT IF EXISTS activity_hours_time_coherence;

-- Nuovo CHECK che permette orari notturni
ALTER TABLE activity_hours
  ADD CONSTRAINT activity_hours_time_coherence CHECK (
    (is_closed = true AND opens_at IS NULL AND closes_at IS NULL
      AND closes_next_day = false)
    OR
    (is_closed = false AND opens_at IS NOT NULL
      AND closes_at IS NOT NULL
      AND (
        closes_at > opens_at                           -- stesso giorno
        OR closes_next_day = true                      -- giorno dopo
      )
    )
  );
