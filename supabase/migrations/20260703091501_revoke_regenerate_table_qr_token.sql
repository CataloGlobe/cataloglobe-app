-- One command per migration file (db push single-prepared-statement rule).
-- REVOKE before GRANT via timestamp. anon revoked; authenticated needs EXECUTE
-- because the RPC's internal has_permission() check keys off the caller's JWT.
REVOKE EXECUTE ON FUNCTION public.regenerate_table_qr_token(uuid, boolean) FROM PUBLIC, anon;
