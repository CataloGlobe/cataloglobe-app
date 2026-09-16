-- =============================================================================
-- ACL _close_seating_unchecked: nessun ruolo applicativo la esegue
-- =============================================================================
-- Non è una RPC. Supabase pre-concede EXECUTE ad anon/authenticated/
-- service_role su ogni funzione nuova: qui si toglie a tutti, e non si
-- concede a nessuno. La eseguono solo `close_seating` e
-- `close_stale_seatings`, SECURITY DEFINER dello stesso owner (postgres), che
-- bypassa l'ACL in quanto proprietario.
--
-- Verifica post-deploy (attesi: tutti false):
--
--   SELECT r, has_function_privilege(r, 'public._close_seating_unchecked(uuid,text)', 'EXECUTE')
--   FROM unnest(ARRAY['anon','authenticated','service_role']) r;

REVOKE ALL ON FUNCTION public._close_seating_unchecked(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
