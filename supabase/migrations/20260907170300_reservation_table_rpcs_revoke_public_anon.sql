-- =============================================================================
-- ACL gesti operatore (1/3): REVOKE da PUBLIC e anon
-- =============================================================================
-- Le tre RPC sono SECURITY DEFINER chiamate dalla dashboard via .rpc():
-- pattern `regenerate_table_qr_token` (20260703091501/091502) e
-- `mark_support_ticket_read` (20260827140003). Supabase pre-concede EXECUTE
-- ad anon/authenticated/service_role su ogni funzione nuova: `anon` va
-- revocato esplicitamente. Tre funzioni in un comando (db push: un prepared
-- statement per file).

REVOKE ALL ON FUNCTION
    public.set_reservation_tables(uuid, uuid[]),
    public.reset_reservation_tables_to_system(uuid),
    public.reassign_activity_tables(uuid, date)
FROM PUBLIC, anon;
