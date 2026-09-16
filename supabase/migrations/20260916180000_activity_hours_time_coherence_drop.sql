-- activity_hours_time_coherence — via il vincolo vecchio (FASE 4.4, 1/2).
--
-- Il CHECK del 19/04 (20260419100000) ammette `closes_next_day = true` con
-- qualunque `closes_at`, anche maggiore di `opens_at`: apre alle 08:00, chiude
-- alle 23:00 «del giorno dopo», una giornata di 39 ore. Il frontend non la
-- scrive mai, il database non la vieta. Fra questo file e il successivo la
-- tabella resta senza vincolo di coerenza: inerte, nessuno scrive lì in quel
-- momento. Su staging nessuna riga viola la regola nuova (52 righe, 7 con
-- closes_next_day, zero con closes_at >= opens_at).
ALTER TABLE public.activity_hours DROP CONSTRAINT IF EXISTS activity_hours_time_coherence;
