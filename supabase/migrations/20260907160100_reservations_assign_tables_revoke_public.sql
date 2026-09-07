-- =============================================================================
-- ACL reservations_assign_tables(): REVOKE da PUBLIC
-- =============================================================================
-- Funzione trigger SECURITY DEFINER: nessun ruolo client deve poterla
-- invocare via POST /rest/v1/rpc (plpgsql la rifiuterebbe comunque — "trigger
-- functions can only be called as triggers" — ma l'elenco delle RPC deve
-- contenere solo ciò che è pubblico). Stesso pattern di
-- reservations_link_guest (20260902120003): PUBLIC, anon, authenticated e
-- service_role, un comando per file (db push, SQLSTATE 42601).
-- ACL attesa a fine serie: solo il proprietario (postgres).

REVOKE EXECUTE ON FUNCTION public.reservations_assign_tables() FROM PUBLIC;
