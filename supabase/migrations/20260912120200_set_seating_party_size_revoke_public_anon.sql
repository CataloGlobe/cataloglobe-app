-- =============================================================================
-- ACL set_seating_party_size (1/3): REVOKE da PUBLIC e anon
-- =============================================================================
-- Sesta RPC del ciclo tavolata, stessa ACL delle cinque di 20260911130500..
-- 130700: SECURITY DEFINER chiamata dalla dashboard via .rpc(). Supabase
-- pre-concede EXECUTE ad anon/authenticated/service_role su ogni funzione
-- nuova: `anon` va revocato esplicitamente. Un comando per file (db push:
-- un prepared statement per file, 42601 altrimenti).

REVOKE ALL ON FUNCTION public.set_seating_party_size(uuid, int)
FROM PUBLIC, anon;
