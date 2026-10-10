-- purge_user_data: search_path di nuovo vuoto.
--
-- 20261007160000 (#292) gli ha fissato `search_path = public` per l'advisor
-- «function_search_path_mutable»; prima era `''`. Il corpo usa solo nomi
-- qualificati (`public.tenant_memberships`, `public.otp_user_verifications`)
-- e funzioni di pg_catalog (`pg_advisory_xact_lock`, `hashtext`,
-- `jsonb_build_object`), sempre visibili: con `''` non cambia nulla e
-- nessun oggetto di `public` può prendere il posto di uno di sistema.
-- Verificato sulla definizione di staging il 2026-10-08.

ALTER FUNCTION public.purge_user_data(uuid) SET search_path = '';
