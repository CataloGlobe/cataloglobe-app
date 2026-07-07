-- One command per migration file (see companion 20260703090501 revoke).
GRANT EXECUTE ON FUNCTION public.submit_order_atomic(uuid,uuid,uuid,uuid,text,uuid,numeric,text,jsonb,uuid,text) TO service_role;
