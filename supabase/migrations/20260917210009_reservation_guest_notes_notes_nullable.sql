-- FASE 5.3 — con i tag nella stessa riga, una riga puo' avere tag e nessuna
-- nota. Il CHECK «btrim(notes) <> ''» resta: vale sui non-NULL, cosi' una
-- nota c'e' o non c'e', mai una stringa vuota. Riga senza nota e senza tag =
-- riga da cancellare (lo fa il service).
ALTER TABLE public.reservation_guest_notes ALTER COLUMN notes DROP NOT NULL;
