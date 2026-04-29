-- Drop policy RLS del bucket `business-items` (dead code, droppato manualmente da dashboard).
-- Audit: docs/db-audit-step-2-code-usage.md L249 (uploadBusinessItemImage non importato).
-- Bucket vuoto verificato su staging E prod prima del drop manuale.
-- Policy hardening 20260424120000 era applicata a bucket morto: questa migration ripulisce.
--
-- Bucket droppato via Supabase Dashboard (Storage API) prima dell'apply di questa migration:
-- DELETE diretto su storage.buckets e' bloccato da trigger Supabase (SQLSTATE 42501).

DROP POLICY IF EXISTS "business-items read" ON storage.objects;
DROP POLICY IF EXISTS "business-items insert" ON storage.objects;
DROP POLICY IF EXISTS "business-items delete" ON storage.objects;
