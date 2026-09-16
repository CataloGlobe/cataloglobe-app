-- =========================================
-- RESERVATIONS — FASE 5.1 (4/4): l'indice parziale segue la terna
-- =========================================
-- Stessa definizione di 20260607155102, stessa WHERE salvo la lista degli
-- stati. Vedi 3/4 per il perché.
--
-- Senza CONCURRENTLY: incompatibile con la transazione della migration.

CREATE INDEX idx_reservations_activity_date_active
    ON public.reservations (activity_id, reservation_date)
    WHERE status IN ('pending','confirmed','seated');
