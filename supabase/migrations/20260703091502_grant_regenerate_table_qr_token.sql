-- One command per migration file (see companion 20260703091501 revoke).
GRANT EXECUTE ON FUNCTION public.regenerate_table_qr_token(uuid, boolean) TO authenticated;
