-- =============================================================================
-- ACL ciclo tavolata (1/3): REVOKE da PUBLIC e anon
-- =============================================================================
-- Le cinque RPC sono SECURITY DEFINER chiamate dalla dashboard via .rpc():
-- stesso pattern dei gesti operatore sull'assegnazione (20260907170300).
-- Supabase pre-concede EXECUTE ad anon/authenticated/service_role su ogni
-- funzione nuova: `anon` va revocato esplicitamente, altrimenti chiunque
-- arrivi alla pagina pubblica potrebbe far sedere gente nei tavoli altrui.
-- Cinque funzioni in un comando (db push: un prepared statement per file).

REVOKE ALL ON FUNCTION
    public.open_seating_for_reservation(uuid),
    public.open_walkin_seating(uuid, uuid[], int),
    public.set_seating_tables(uuid, uuid[]),
    public.close_seating(uuid, text),
    public.undo_seating(uuid)
FROM PUBLIC, anon;
