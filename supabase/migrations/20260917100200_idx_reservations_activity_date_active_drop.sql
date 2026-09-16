-- =========================================
-- RESERVATIONS — FASE 5.1 (3/4): l'indice parziale segue la terna
-- =========================================
-- idx_reservations_activity_date_active (20260607155102) copre
-- `status IN ('pending','confirmed')`. Con le funzioni ora su tre stati il
-- predicato dell'indice non implica più quello delle query: il planner
-- smetterebbe di usarlo e reservation_peak_with_candidate /
-- reservation_pacing_block diventerebbero scansioni complete. Si ricrea in
-- 4/4 con la terna. Fra i due file la tabella resta servita da
-- idx_reservations_activity_date (stesse colonne, non parziale).
--
-- Senza CONCURRENTLY: incompatibile con la transazione della migration.

DROP INDEX IF EXISTS public.idx_reservations_activity_date_active;
