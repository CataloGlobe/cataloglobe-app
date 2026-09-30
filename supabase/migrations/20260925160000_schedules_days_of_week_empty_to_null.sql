-- days_of_week = '{}' → NULL.
--
-- Per il resolver (`isTimeRuleActiveNow`, supabase/functions/_shared/
-- scheduleCompetition.ts) un array vuoto vuol dire «mai»: la regola non si
-- accende in nessun giorno. Nessuno lo ha scelto così: lo scriveva il
-- salvataggio delle regole «In evidenza» quando non c'era un giorno scelto
-- (corretto nello stesso lotto: daysOfWeekForDb non scrive più []). Il
-- significato voluto era «ogni giorno», cioè NULL.
--
-- EFFETTO VISIBILE: le righe toccate che sono abilitate e in periodo
-- cominciano a comparire sulla pagina pubblica nella loro fascia oraria.
-- Staging, 25/09/2026: 3 righe, tutte featured e abilitate; due hanno il
-- periodo chiuso ad aprile 2026, la terza (aaa845cf…, 11:00–15:00, senza
-- periodo) si accende ogni giorno.
--
-- Idempotente: una seconda esecuzione non trova righe.

UPDATE public.schedules
SET days_of_week = NULL
WHERE days_of_week = '{}';
