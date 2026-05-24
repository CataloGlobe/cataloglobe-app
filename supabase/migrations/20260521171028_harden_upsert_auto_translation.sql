-- =========================================
-- SECURITY HARDENING — upsert_auto_translation membership check
-- =========================================
-- Closes a cross-tenant content-manipulation gap discovered during a
-- retroactive audit (2026-05-21) of SECURITY DEFINER functions in the
-- public schema, following the pattern documented in CLAUDE.md under
-- "Funzioni SQL → SECURITY DEFINER service-role-only".
--
-- Vulnerability summary:
--   `public.upsert_auto_translation` is SECURITY DEFINER and has
--   EXECUTE granted to anon, authenticated, postgres, service_role
--   (Supabase default for functions created in `public`). The function
--   accepted `p_tenant_id` as a free parameter with NO membership
--   verification. An anon caller could therefore overwrite or insert
--   `translations` rows for any tenant of their choice, causing the
--   tenant's public site to display attacker-controlled text in any
--   non-default language. The only pre-existing guard was the
--   `WHERE status = 'auto'` clause on the UPDATE branch, which
--   protected manual overrides from being clobbered but did nothing
--   to prevent insertion of malicious auto rows or overwriting of
--   benign auto rows.
--
-- Proof-of-concept attack (rejected by this migration):
--   SET LOCAL role anon;
--   SELECT public.upsert_auto_translation(
--       '<victim-tenant-uuid>',
--       'product', '<victim-product-uuid>', 'description', 'fr',
--       'irrelevant', 'irrelevant',
--       'ATTACKER-CONTROLLED TEXT',
--       'deepl'
--   );
--
-- Fix: add an authorization gate at the top of the function body.
--   - service_role passes through unchanged (legitimate Edge Function
--     invocations, e.g. the process-translation-jobs cron).
--   - Every other caller (authenticated user, anon) must prove
--     membership in `p_tenant_id` via `public.get_my_tenant_ids()`.
--     Anon callers have `auth.uid() = NULL`, so the helper returns an
--     empty set and the IN check fails — they are blocked.
--   - On failure: RAISE EXCEPTION with ERRCODE 42501 (insufficient
--     privilege). PostgREST translates this to HTTP 403 client-side.
--
-- Why not also REVOKE EXECUTE FROM anon / authenticated:
--   The function may legitimately be invoked by admin clients in the
--   future via supabase-js direct RPC; keeping the grants and gating
--   internally preserves that surface without weakening the security
--   posture. If we later confirm the function is server-side only,
--   a follow-up migration can apply the strict REVOKE pattern from
--   CLAUDE.md (SECURITY DEFINER service-role-only).
--
-- Backward compatibility:
--   - service_role callers (Edge Functions, cron jobs) — unchanged.
--   - authenticated callers who are members of `p_tenant_id` — unchanged.
--   - anon callers — now blocked (was the actual attack surface).
--   - authenticated callers targeting a tenant they do not belong to —
--     now blocked. This case has no legitimate use; if it surfaces in
--     telemetry post-deploy, the original call site is a bug.
--
-- Signature, RETURN type, language, search_path setting, and existing
-- guards (provider whitelist, manual short-circuit, UPDATE race guard)
-- are preserved byte-for-byte from the prior definition. The only
-- behavioural diff is the new authorization gate.

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_auto_translation(
    p_tenant_id      uuid,
    p_entity_type    text,
    p_entity_id      text,
    p_field          text,
    p_language_code  text,
    p_source_text    text,
    p_source_hash    text,
    p_translated_text text,
    p_provider       text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    -- Double-defense JWT role discovery. Supabase Edge Functions and
    -- PostgREST may expose the JWT claim "role" via either of two GUC
    -- patterns depending on the runtime path:
    --   - request.jwt.claim.role         (individual claim setting)
    --   - request.jwt.claims::jsonb->>role  (full JWT blob)
    -- We sample both. The auth gate below passes service_role if EITHER
    -- channel reports it, so we don't accidentally block legitimate
    -- Edge Function invocations whose claim is exposed via one path only.
    v_jwt_role        TEXT := current_setting('request.jwt.claim.role', true);
    v_jwt_claims_role TEXT := (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role');
    v_existing_status TEXT;
BEGIN
    -- Authorization gate.
    -- service_role passes through (legitimate Edge Function invocations
    -- such as the process-translation-jobs cron). All other callers
    -- (authenticated humans, anon) must prove membership in the target
    -- tenant. Anon callers have auth.uid() = NULL, so get_my_tenant_ids()
    -- returns an empty set and the IN check fails — they are blocked.
    -- We require that NEITHER channel reports service_role before
    -- enforcing the membership check, ensuring resilience against
    -- claim-exposure path variance across Supabase runtimes.
    IF v_jwt_role IS DISTINCT FROM 'service_role'
       AND v_jwt_claims_role IS DISTINCT FROM 'service_role' THEN
        IF p_tenant_id IS NULL
           OR NOT (p_tenant_id IN (SELECT public.get_my_tenant_ids())) THEN
            RAISE EXCEPTION 'Forbidden: tenant mismatch'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Provider whitelist (existing): only auto-issued providers may use this RPC.
    IF p_provider NOT IN ('deepl', 'google', 'system', 'mock') THEN
        RAISE EXCEPTION 'Invalid provider for auto translation: %', p_provider
            USING ERRCODE = '22023';
    END IF;

    -- Lookup current status, if any.
    SELECT status
    INTO v_existing_status
    FROM public.translations
    WHERE (tenant_id IS NOT DISTINCT FROM p_tenant_id)
      AND entity_type   = p_entity_type
      AND entity_id     = p_entity_id
      AND field         = p_field
      AND language_code = p_language_code;

    -- Guard 1: explicit short-circuit when row is manual.
    IF v_existing_status = 'manual' THEN
        RETURN FALSE;
    END IF;

    -- INSERT new row OR UPDATE existing auto row.
    -- Guard 2 (defense-in-depth): WHERE status = 'auto' on the UPDATE branch
    -- protects against a race between the SELECT above and INSERT ... ON CONFLICT.
    INSERT INTO public.translations (
        tenant_id, entity_type, entity_id, field, language_code,
        source_text, source_hash, translated_text, provider, status
    ) VALUES (
        p_tenant_id, p_entity_type, p_entity_id, p_field, p_language_code,
        p_source_text, p_source_hash, p_translated_text, p_provider, 'auto'
    )
    ON CONFLICT (tenant_id, entity_type, entity_id, field, language_code)
    DO UPDATE SET
        source_text     = EXCLUDED.source_text,
        source_hash     = EXCLUDED.source_hash,
        translated_text = EXCLUDED.translated_text,
        provider        = EXCLUDED.provider,
        status          = 'auto',
        updated_at      = now()
    WHERE public.translations.status = 'auto';

    RETURN TRUE;
END;
$function$;

COMMIT;
