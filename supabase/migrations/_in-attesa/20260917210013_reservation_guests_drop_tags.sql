-- FASE 5.3 (gruppo finale) — i tag del locale sono per sede, in
-- `reservation_guest_notes`. Da applicare SOLO dopo aver verificato che in
-- produzione nessun profilo abbia tag (cardinality(tags) > 0 = 0 righe): con
-- righe in uso la premessa «zero dati» salta e i tag vanno spostati, non
-- cancellati. L'indice GIN `idx_reservation_guests_tags` cade con la colonna.
ALTER TABLE public.reservation_guests DROP COLUMN IF EXISTS tags;
