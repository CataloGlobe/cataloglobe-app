-- =========================================
-- RESERVATIONS — Pacing (3/4): REVOKE
-- =========================================
-- Il DROP+CREATE dei file 1/4 e 2/4 crea una funzione NUOVA: i grant della v1
-- non sopravvivono e vanno riapplicati da zero (a differenza di
-- CREATE OR REPLACE sulla stessa firma, che li preserva).
--
-- `REVOKE ... FROM PUBLIC` da solo NON basta: Supabase pre-configura grant di
-- default a `anon, authenticated, service_role` su ogni funzione nuova. Una
-- SECURITY DEFINER raggiungibile da `anon` sarebbe un buco: chiunque potrebbe
-- inserire prenotazioni scavalcando il rate limit e i controlli
-- (sede pubblicata, abbonamento valido, feature di piano) che vivono
-- nell'Edge function. Quindi REVOKE esplicito anche da anon e authenticated.
--
-- Lista di ruoli in un unico comando: `db push` invia ogni file come singolo
-- prepared statement (SQLSTATE 42601 con piu' comandi).
--
-- Il GRANT a service_role sta nel file 4/4, separato per lo stesso motivo.

REVOKE ALL ON FUNCTION public.place_online_reservation(
    uuid, date, time, int, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
