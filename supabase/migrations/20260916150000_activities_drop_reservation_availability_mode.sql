-- activities.reservation_availability_mode — colonna morta (FASE 4.3).
--
-- Introdotta il 07/06 (20260607155102) con CHECK IN ('turni','continua') e
-- DEFAULT 'continua' come predisposizione per i turni, mai cablata: nessun
-- lettore nel repo (src/, supabase/functions/) oltre alla dichiarazione del
-- tipo TS, zero sedi su 25 con valore diverso dal default. Una sede messa a
-- 'turni' da Studio si comportava come 'continua' senza dirlo: trappola,
-- non feature a meta'. I turni non si fanno (decisione FASE 4, §6 del piano):
-- la colonna si rimuove.
ALTER TABLE public.activities DROP COLUMN IF EXISTS reservation_availability_mode;
