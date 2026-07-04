-- One command per migration file: `supabase db push` sends a wrapper-less file
-- as a single prepared statement, so REVOKE and GRANT must live in separate
-- files (a REVOKE+GRANT file fails SQLSTATE 42601). REVOKE runs before GRANT via
-- the earlier timestamp. Removes the default anon/authenticated EXECUTE that
-- Supabase auto-grants on a newly created public function.
REVOKE EXECUTE ON FUNCTION public.submit_order_atomic(uuid,uuid,uuid,uuid,text,uuid,numeric,text,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
