-- =========================================
-- RESERVATIONS — Assegnazione tavoli (5/7): REVOKE sul motore
-- =========================================
-- `SECURITY DEFINER`: legge `tables` e `reservations` e scrive
-- `reservation_tables` scavalcando la RLS. Nessun ruolo client deve poterla
-- chiamare: `anon` con un uuid indovinato potrebbe forzare ricalcoli, e
-- `authenticated` di un altro tenant scoprirebbe (via reason) se una
-- prenotazione esiste.
--
-- REVOKE da PUBLIC NON basta: Supabase pre-concede EXECUTE ad
-- `anon, authenticated, service_role` su ogni funzione nuova.
--
-- Nessun GRANT di ritorno, nemmeno a service_role: in questa fase l'unico
-- chiamante è `place_online_reservation` (SECURITY DEFINER, stesso owner,
-- esegue con i diritti del definer). Quando arriverà il ricalcolo dalla
-- dashboard host, il GRANT (e il pre-check permessi che deve accompagnarlo)
-- andrà deciso in quella fase, non dato per scontato adesso.

REVOKE ALL ON FUNCTION public.assign_tables_for_reservation(uuid)
FROM PUBLIC, anon, authenticated, service_role;
