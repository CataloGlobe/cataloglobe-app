-- Grant di crm_admin_decide_draft (file separato: `db push` non accetta
-- CREATE FUNCTION e REVOKE/GRANT nello stesso file, vedi docs/patterns/storage-sql.md).
REVOKE ALL ON FUNCTION public.crm_admin_decide_draft(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_admin_decide_draft(uuid, text, text) TO authenticated;
