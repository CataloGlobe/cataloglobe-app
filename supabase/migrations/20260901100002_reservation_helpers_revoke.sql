-- =========================================
-- RESERVATIONS — Estrazione (3/7): REVOKE sui due helper
-- =========================================
-- Sono `SECURITY DEFINER` e leggono `reservations` scavalcando la RLS: nessun
-- ruolo client deve poterle chiamare. `anon` che interrogasse
-- `reservation_peak_with_candidate` ricaverebbe i coperti attesi di un locale
-- una fascia alla volta — informazione commerciale, esattamente ciò che il
-- contratto pubblico non deve far trapelare.
--
-- REVOKE da PUBLIC NON basta: Supabase pre-concede EXECUTE ad
-- `anon, authenticated, service_role` su ogni funzione nuova.
--
-- Nessun GRANT di ritorno, nemmeno a service_role: gli unici chiamanti sono
-- `place_online_reservation` e `get_reservation_day_availability`, entrambe
-- SECURITY DEFINER di proprietà del superuser, che le eseguono con i diritti
-- del definer. Se un domani servisse chiamarle dall'esterno, quel GRANT va
-- discusso, non dato per scontato adesso.
--
-- Due funzioni in un comando solo: `db push` invia ogni file come singolo
-- prepared statement (SQLSTATE 42601 con più comandi).

REVOKE ALL ON FUNCTION
    public.reservation_peak_with_candidate(uuid, date, time, int, int),
    public.reservation_pacing_block(uuid, date, time, int, int, int, int)
FROM PUBLIC, anon, authenticated, service_role;
