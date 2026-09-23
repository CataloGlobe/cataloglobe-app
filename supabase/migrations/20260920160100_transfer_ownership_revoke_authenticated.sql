-- transfer_ownership È chiamata, ma solo lato DB: la invoca
-- execute_account_deletion_tenant_ops (SECURITY DEFINER, owner postgres)
-- nel ramo action="transfer" di delete-account. Dentro una SECURITY
-- DEFINER l'EXECUTE sulla funzione annidata si verifica contro l'owner
-- (postgres), non contro il ruolo del chiamante: il grant ad authenticated
-- non serve a quel percorso. Nessun client la chiama via REST.
--
-- Ripristina l'ACL di 20260429150000 (solo postgres/service_role),
-- annullata da 20260920140000 che aveva ri-GRANTato authenticated.
-- Idempotente sui due ambienti: in produzione l'ACL è già così (la
-- 20260920140000 non ci è mai arrivata); in staging annulla la regressione.
--
-- Split in file separato da 20260920160000: CREATE FUNCTION + REVOKE/GRANT
-- nello stesso file fa fallire `supabase db push` con 42601 (vedi CLAUDE.md
-- "Migration con CREATE FUNCTION + REVOKE/GRANT").
REVOKE ALL ON FUNCTION public.transfer_ownership(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_ownership(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.transfer_ownership(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.transfer_ownership(uuid, uuid) TO service_role;
