-- =============================================================================
-- SECURITY FIX: tenant-assets storage + update_tenant_logo hardening
--
-- Corregge le vulnerabilità introdotte in 20260324120000_tenant_logo_url.sql:
--
--   1. Storage policies per INSERT/UPDATE/DELETE erano aperte a qualsiasi
--      utente autenticato — qualunque user poteva scrivere in qualsiasi cartella
--      del bucket tenant-assets.
--
--   2. update_tenant_logo controllava solo owner_user_id, escludendo gli admin.
--      Mancava inoltre il guard esplicito su auth.uid() IS NOT NULL.
--
-- Non modifica: schema DB, bucket, policy SELECT, get_tenant_public_info.
-- =============================================================================

BEGIN;

-- =============================================================================
-- FIX 1 — STORAGE: replace write policies con folder-based tenant check
--
-- Path convention: tenant-assets/{tenant_id}/logo.<ext>
-- (storage.foldername(name))[1] estrae il primo componente del path (tenant_id).
-- get_my_tenant_ids() restituisce gli uuid dei tenant accessibili dal caller.
--
-- SELECT resta pubblica (bucket è public) — nessuna modifica necessaria.
-- =============================================================================

-- Rimuovi le policy permissive esistenti
DROP POLICY IF EXISTS "tenant_assets_insert" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_update" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_delete" ON storage.objects;

-- INSERT: solo se il tenant_id nel path appartiene al caller
CREATE POLICY "tenant_assets_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(name))[1]::uuid = ANY(SELECT public.get_my_tenant_ids())
  );

-- UPDATE: stesso controllo su USING e WITH CHECK
CREATE POLICY "tenant_assets_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(name))[1]::uuid = ANY(SELECT public.get_my_tenant_ids())
  )
  WITH CHECK (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(name))[1]::uuid = ANY(SELECT public.get_my_tenant_ids())
  );

-- DELETE: stesso controllo
CREATE POLICY "tenant_assets_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(name))[1]::uuid = ANY(SELECT public.get_my_tenant_ids())
  );

-- =============================================================================
-- FIX 2 — RPC: hardening update_tenant_logo
--
-- Problemi nella versione precedente:
--   - Controllava solo owner_user_id: gli admin non potevano aggiornare il logo
--   - Nessun guard esplicito su auth.uid() IS NOT NULL
--
-- Fix:
--   - Aggiunge guard auth.uid() IS NOT NULL come primo check
--   - Autorizza owner (via tenants.owner_user_id) O admin attivo
--     (via tenant_memberships con role IN ('owner','admin') e status='active')
--   - Firma invariata: update_tenant_logo(p_tenant_id uuid, p_logo_url text)
--   - Mantiene SECURITY DEFINER e search_path = public
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_tenant_logo(p_tenant_id uuid, p_logo_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard: richiede utente autenticato
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Autorizza owner diretto O admin attivo del tenant
  IF NOT EXISTS (
    -- Branch A: owner del tenant
    SELECT 1 FROM public.tenants
    WHERE id          = p_tenant_id
      AND owner_user_id = auth.uid()
      AND deleted_at  IS NULL
  ) AND NOT EXISTS (
    -- Branch B: membro con ruolo owner o admin
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.role      IN ('owner', 'admin')
      AND tm.status    = 'active'
      AND t.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.tenants SET logo_url = p_logo_url WHERE id = p_tenant_id;
END;
$$;

-- Grant invariato
REVOKE ALL ON FUNCTION public.update_tenant_logo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tenant_logo(uuid, text) TO authenticated;

COMMIT;
