-- =============================================================================
-- Privilegi di 20261017100000 (separati: CREATE FUNCTION e GRANT nello stesso
-- file fanno fallire db push, 42601).
-- =============================================================================

REVOKE ALL ON FUNCTION public.reorder_catalogs(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reorder_catalogs(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.reorder_catalogs(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.reorder_catalogs(uuid, uuid[]) IS
  'Multi menù passo 5: riscrive catalogs.sort_order da 1 nell''ordine dato; elenco = tutti i menù dell''azienda. Permesso catalogs.write.';
