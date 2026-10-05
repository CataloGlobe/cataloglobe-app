-- =============================================================================
-- CRM, Fase 2 (F2-1): funzioni della base contatti per l'outreach.
--
--   crm_email_fingerprint           impronta della mail normalizzata
--   crm_outreach_prospect_guard     trigger: normalizza e applica le liste stop
--   crm_suppress_email              mette una mail nella lista di esclusione
--   crm_is_email_suppressed         controllo per il futuro invio (F2-2)
--
-- Le liste stop vincono sempre: un contatto la cui mail o il cui telefono è
-- in lista resta «escluso, lista_stop» qualunque cosa scriva l'import o il
-- client. crm_suppressions (telefoni) è solo letta, non modificata.
-- I privilegi stanno nella migrazione successiva (42601 con db push).
-- =============================================================================

-- Minuscole e senza spazi attorno: «Info@Locale.it » e «info@locale.it» sono
-- la stessa mail. Stessa forma di crm_phone_fingerprint.
CREATE OR REPLACE FUNCTION public.crm_email_fingerprint(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.lower(pg_catalog.btrim(p_email)), 'UTF8')), 'hex');
$$;

-- -----------------------------------------------------------------------------
-- Guardia sui contatti
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_outreach_prospect_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    IF NEW.email IS NOT NULL THEN
        NEW.email := pg_catalog.lower(pg_catalog.btrim(NEW.email));
        IF NEW.email = '' THEN
            NEW.email := NULL;
        END IF;
    END IF;

    IF (NEW.email IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.crm_email_suppressions s
            WHERE s.email_fingerprint = public.crm_email_fingerprint(NEW.email)))
       OR (NEW.phone_e164 IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.crm_suppressions s
            WHERE s.phone_fingerprint = public.crm_phone_fingerprint(NEW.phone_e164)))
    THEN
        NEW.status := 'escluso';
        NEW.excluded_reason := 'lista_stop';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_outreach_prospects_guard ON public.crm_outreach_prospects;
CREATE TRIGGER crm_outreach_prospects_guard
    BEFORE INSERT OR UPDATE ON public.crm_outreach_prospects
    FOR EACH ROW EXECUTE FUNCTION public.crm_outreach_prospect_guard();

-- -----------------------------------------------------------------------------
-- crm_suppress_email: nella lista per sempre, ed escluso ogni contatto con
-- quella mail. Idempotente: una mail già in lista tiene il primo motivo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_suppress_email(p_email text, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
BEGIN
    IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
        RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = '42501';
    END IF;
    IF v_email = '' THEN
        RAISE EXCEPTION 'email_required' USING ERRCODE = '22023';
    END IF;
    IF p_reason IS NULL OR p_reason NOT IN ('disiscritto', 'richiesta', 'rimbalzo', 'a_mano') THEN
        RAISE EXCEPTION 'invalid_reason' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.crm_email_suppressions (email_fingerprint, reason, created_by)
    VALUES (public.crm_email_fingerprint(v_email), p_reason, (SELECT auth.uid()))
    ON CONFLICT (email_fingerprint) DO NOTHING;

    UPDATE public.crm_outreach_prospects p
    SET status = 'escluso', excluded_reason = 'lista_stop'
    WHERE p.email = v_email
      AND p.status IS DISTINCT FROM 'escluso';
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_is_email_suppressed: lo userà l'invio delle mail (F2-2) prima di partire.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_is_email_suppressed(p_email text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
        RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = '42501';
    END IF;
    -- Una mail che non si sa leggere non si scrive: vale come esclusa.
    IF p_email IS NULL OR pg_catalog.btrim(p_email) = '' THEN
        RETURN true;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.crm_email_suppressions s
        WHERE s.email_fingerprint = public.crm_email_fingerprint(p_email)
    );
END;
$$;
