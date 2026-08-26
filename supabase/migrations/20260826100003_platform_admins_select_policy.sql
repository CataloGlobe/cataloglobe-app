-- ============================================================================
-- platform_admins — policy SELECT.
-- ============================================================================
--
-- Ultimo anello della sequenza: richiede `public.is_platform_admin()`
-- (20260826100001) gia' esistente e con l'ACL corretta (20260826100002).
-- Vive in un file separato dalla CREATE TABLE (20260826100000) solo per
-- rompere la dipendenza circolare tabella <-> funzione — vedi il commento
-- in testa a quel file.
--
-- Pattern: `schedule_targets` — read via singola chiamata a helper booleano,
-- write negate con policy esplicita `false` (gia' create nel file 1).
--
-- Ricorsione: nessuna. `is_platform_admin()` e' SECURITY DEFINER e gira come
-- owner della tabella, esente da RLS.
-- ============================================================================

DROP POLICY IF EXISTS "Platform admins can read platform_admins" ON public.platform_admins;
CREATE POLICY "Platform admins can read platform_admins"
    ON public.platform_admins
    FOR SELECT
    TO authenticated
    USING (public.is_platform_admin());
