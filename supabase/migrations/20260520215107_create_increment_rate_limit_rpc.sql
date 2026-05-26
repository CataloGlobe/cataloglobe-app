-- =========================================
-- ORDERS EPIC — Phase 2.3b: increment_rate_limit RPC
-- =========================================
-- Companion to the `public.rate_limit_buckets` table (migration
-- 20260520214121). Encapsulates the atomic fixed-window counter UPSERT
-- so that the shared TypeScript helper `rateLimit.ts` can invoke it via
-- supabase.rpc(...).
--
-- Why an RPC instead of the supabase-js `.upsert()` API:
--   The fixed-window logic needs a CASE expression in the ON CONFLICT
--   branch (reset count when the window has rolled over, otherwise
--   increment). PostgREST's `.upsert()` cannot express this; only raw
--   SQL can. Wrapping it in a SECURITY DEFINER function keeps the
--   atomicity guarantees of `INSERT ... ON CONFLICT DO UPDATE` while
--   exposing a minimal RPC surface to Edge Functions.
--
-- Atomicity:
--   `INSERT ... ON CONFLICT DO UPDATE` is atomic per row inside Postgres
--   (row-level lock acquired on conflict). Concurrent Edge Function
--   invocations targeting the same bucket_key serialize correctly — no
--   explicit advisory lock required.
--
-- Security hardening (CLAUDE.md SECURITY DEFINER pattern):
--   - VOLATILE: function mutates DB state.
--   - SET search_path TO '': prevents search_path hijacking attacks.
--   - All identifiers fully qualified (public.rate_limit_buckets).
--   - REVOKE EXECUTE FROM PUBLIC, then GRANT only to service_role.
--     Anon and authenticated callers cannot invoke this RPC, so client
--     code paths cannot bypass rate limiting by calling it directly.

BEGIN;

CREATE OR REPLACE FUNCTION public.increment_rate_limit(
    p_bucket_key   text,
    p_window_start timestamptz
)
RETURNS int
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
    INSERT INTO public.rate_limit_buckets (bucket_key, window_start, count)
    VALUES (p_bucket_key, p_window_start, 1)
    ON CONFLICT (bucket_key) DO UPDATE SET
        count = CASE
            WHEN public.rate_limit_buckets.window_start = EXCLUDED.window_start
            THEN public.rate_limit_buckets.count + 1
            ELSE 1
        END,
        window_start = EXCLUDED.window_start
    RETURNING count;
$$;

-- Strip the implicit PUBLIC grant before handing access to specific roles.
REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(text, timestamptz) FROM PUBLIC;

-- Only the service_role (Edge Functions) may invoke this RPC.
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, timestamptz) TO service_role;

COMMIT;
