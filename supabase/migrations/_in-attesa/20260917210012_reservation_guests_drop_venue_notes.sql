-- FASE 5.3 (gruppo finale) — la nota del locale non e' piu' dell'azienda: vive in
-- `reservation_guest_notes`, per sede. Zero righe con valore al momento
-- della migration (staging e produzione, 2026-09-17): niente da spostare.
-- Lasciare la colonna vorrebbe dire due case per la stessa cosa.
ALTER TABLE public.reservation_guests DROP COLUMN IF EXISTS venue_notes;
