-- =========================================
-- RESERVATIONS — Estrazione (6/7): REVOKE sulla lettura di disponibilità
-- =========================================
-- Come per gli helper: `SECURITY DEFINER` che legge `reservations` scavalcando
-- la RLS, quindi nessun ruolo client la chiama direttamente.
--
-- Qui il motivo non è il segreto commerciale (la risposta è già binaria e
-- destinata al pubblico) ma i gate: sede pubblicata, prenotazioni abilitate,
-- abbonamento valido, feature di piano, rate limit. Vivono nell'Edge function,
-- e `anon` che chiamasse la RPC direttamente li scavalcherebbe tutti —
-- ottenendo anche un oracolo sull'esistenza di una sede a partire dal suo id.
--
-- REVOKE da PUBLIC non basta: Supabase pre-concede EXECUTE ad
-- `anon, authenticated, service_role`. Il GRANT a service_role torna nel 7/7.

REVOKE ALL ON FUNCTION public.get_reservation_day_availability(
    uuid, date, int, time[]
) FROM PUBLIC, anon, authenticated;
