-- CRM post-vendita: grant della lettura dei clienti (20261006090100).
-- Admin di piattaforma dal pannello, service role da crm-sync-accounts; la
-- funzione controlla da sé chi entra.
REVOKE ALL ON FUNCTION public.crm_post_sale_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_post_sale_accounts() TO authenticated, service_role;
