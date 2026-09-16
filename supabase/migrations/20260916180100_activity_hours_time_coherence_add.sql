-- activity_hours_time_coherence — il vincolo nuovo (FASE 4.4, 2/2).
--
-- Con `closes_next_day = true` deve valere `closes_at < opens_at`: la chiusura
-- cade nella notte fra il giorno e il successivo, prima dell'ora di apertura.
-- Stretta, non `<=`: con l'uguaglianza la giornata dura esattamente 24 ore e
-- la coda notturna su D+1 (00:00 → closes_at = opens_at) diventa un intervallo
-- che la griglia dei picker non sa rendere. Una sede davvero aperta 24 ore è
-- una feature a parte, decisa apposta, non l'effetto collaterale di un
-- confronto.
ALTER TABLE public.activity_hours ADD CONSTRAINT activity_hours_time_coherence CHECK (
    (is_closed = true AND opens_at IS NULL AND closes_at IS NULL AND closes_next_day = false)
    OR (
        is_closed = false AND opens_at IS NOT NULL AND closes_at IS NOT NULL
        AND (
            (closes_next_day = false AND closes_at > opens_at)
            OR (closes_next_day = true AND closes_at < opens_at)
        )
    )
);
