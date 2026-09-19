-- Trigrammi: l'unico modo per servire con un indice un LIKE per suffisso
-- ('%1234567') — un btree serve solo i prefissi. Schema `extensions`, come
-- Supabase prevede per le estensioni installate dall'utente (FASE 5.4).

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
