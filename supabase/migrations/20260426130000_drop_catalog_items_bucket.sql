-- Rimuove il bucket orfano catalog-items.
-- Zero file presenti (verificato), zero callers nel codice,
-- nessuna tabella DB associata.

DROP POLICY IF EXISTS "catalog-items read" ON storage.objects;
DROP POLICY IF EXISTS "catalog-items insert" ON storage.objects;
DROP POLICY IF EXISTS "catalog-items update" ON storage.objects;
DROP POLICY IF EXISTS "catalog-items delete" ON storage.objects;

-- NOTA: il bucket va eliminato manualmente dalla dashboard Supabase
-- (Storage → catalog-items → Delete bucket) perché Supabase blocca
-- DELETE diretti sulla tabella storage.buckets via SQL.
