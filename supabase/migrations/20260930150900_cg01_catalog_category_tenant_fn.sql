-- =============================================================================
-- CG-01: controllo "categoria dello stesso tenant" senza ricorsione RLS (funzione).
-- =============================================================================
--
-- Problema: le policy RESTRICTIVE "Parent same tenant on insert/update" di
-- catalog_categories (20260930150000) verificano parent_category_id con un
-- EXISTS su catalog_categories stessa. Una policy che interroga la propria
-- tabella fa riapplicare l'RLS di quella tabella dentro la sottoquery:
-- Postgres lo rileva e rifiuta con 42P17 (infinite recursion detected in
-- policy for relation "catalog_categories"). Effetto su staging: ogni INSERT e
-- UPDATE di catalog_categories da authenticated fallisce, anche senza parent.
-- È l'unica delle 34 policy della 150000 che interroga la propria tabella; i
-- parent delle altre non hanno policy SELECT con sottoquery (verificato su
-- pg_policies il 2026-10-01), quindi niente cicli indiretti.
--
-- Fix: la verifica passa da questa funzione SECURITY DEFINER (owner postgres,
-- owner della tabella: l'RLS non si applica dentro la funzione, e una funzione
-- SQL SECURITY DEFINER non viene inlined). Le policy vengono ricreate nel
-- file successivo, insieme a REVOKE/GRANT.
--
-- Nessun leak: la funzione risponde solo sì/no, e solo per i tenant del
-- chiamante (get_my_tenant_ids). Per un tenant altrui risponde sempre false,
-- quindi non si può usare per sapere se una categoria esiste in un'altra
-- azienda. Nelle policy il tenant passato è quello della riga, che la policy
-- permissiva "Tenant insert/update own rows" richiede già tra i propri.
--
-- STABLE: legge soltanto. search_path vuoto, nomi qualificati.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.catalog_category_in_tenant(
  p_category_id uuid,
  p_tenant_id   uuid
)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.catalog_categories c
     WHERE c.id = p_category_id
       AND c.tenant_id = p_tenant_id
       AND p_tenant_id IN (SELECT public.get_my_tenant_ids())
  );
$function$;
