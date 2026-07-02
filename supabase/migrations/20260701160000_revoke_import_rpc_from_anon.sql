-- Rimuove il grant esplicito Supabase ad anon sulla RPC import_products_into_catalog.
-- REVOKE FROM PUBLIC (migration 20260630120000) non toglie il grant esplicito ad anon.
-- La RPC è SECURITY DEFINER e scrive su 6 tabelle: non deve essere invocabile da anonimi.
-- (La guardia interna auth.uid() IS NULL → 42501 copre comunque; questo è hardening.)
-- Idempotente: su staging il REVOKE è già stato applicato a mano.
REVOKE EXECUTE ON FUNCTION public.import_products_into_catalog(uuid, uuid, text, jsonb, jsonb) FROM anon;
