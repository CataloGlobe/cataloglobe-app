-- =============================================================================
-- ACL di replace_product_ingredients(UUID, UUID, JSONB)
--
-- File separato da CREATE FUNCTION: `supabase db push` fallisce con SQLSTATE
-- 42601 quando CREATE FUNCTION e REVOKE/GRANT stanno nello stesso file
-- (vedi docs/patterns/storage-sql.md).
--
-- Stessa ACL della vecchia firma uuid[] (20260509120000): la chiama il
-- frontend admin autenticato (src/services/supabase/ingredients.ts), mai anon.
-- La funzione e' SECURITY DEFINER ma verifica il tenant del chiamante via
-- get_my_tenant_ids(), quindi non concede nulla oltre a cio' che l'utente
-- potrebbe gia' fare con le policy RLS della tabella.
-- =============================================================================

REVOKE ALL ON FUNCTION public.replace_product_ingredients(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_product_ingredients(UUID, UUID, JSONB) FROM anon;

GRANT EXECUTE ON FUNCTION public.replace_product_ingredients(UUID, UUID, JSONB) TO authenticated;
