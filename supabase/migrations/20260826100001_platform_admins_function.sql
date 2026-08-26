-- ============================================================================
-- is_platform_admin() — helper booleano per l'area /admin di piattaforma.
-- ============================================================================
--
-- Modello stilistico: `get_my_tenant_ids()` / `has_permission()`.
--   SECURITY DEFINER · STABLE · SET search_path TO '' · qualifiche public.*
--
-- Perche' SECURITY DEFINER: la policy SELECT su `platform_admins`
-- (20260826100002) chiama questa funzione, che a sua volta legge
-- `platform_admins`. Girando come owner della tabella (postgres, esente da RLS
-- salvo FORCE ROW LEVEL SECURITY) la lettura interna non ri-valuta la policy →
-- nessuna ricorsione RLS.
--
-- ACL: assegnata nel file successivo (20260826100002). `CREATE FUNCTION` e
-- `REVOKE`/`GRANT` nello stesso file fanno fallire `supabase db push` con
-- SQLSTATE 42601 — vedi docs/patterns/storage-sql.md.
-- Fino a quel momento la funzione eredita i grant di default di Supabase
-- (anon, authenticated, service_role): la finestra e' innocua perche' la
-- policy SELECT che la usa non esiste ancora e `platform_admins` e' in
-- deny-all.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_platform_admin() IS
    'True se il chiamante e'' un admin di piattaforma (riga in public.platform_admins). Autorizzazione NON tenant-scoped: indipendente da get_my_tenant_ids() / has_permission(). Ritorna false per sessioni anonime (auth.uid() NULL).';
