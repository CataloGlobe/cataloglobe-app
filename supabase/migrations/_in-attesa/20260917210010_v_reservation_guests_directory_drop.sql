-- FASE 5.3 (gruppo finale) — la vista selezionava `g.venue_notes` e `g.tags`,
-- che spariscono (20260917210012/13). DROP e CREATE in file separati: un
-- comando per file.
-- Nessun'altra vista dipende da questa (verificato su pg_depend, staging).
DROP VIEW IF EXISTS public.v_reservation_guests_directory;
