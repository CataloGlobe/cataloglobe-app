// Fixed-window rate limit helper for client-facing Edge Functions.
//
// Backed by:
//   - public.rate_limit_buckets   (migration 20260520214121)
//   - public.increment_rate_limit (migration 20260520215107, SECURITY DEFINER,
//                                  service_role only)
//
// Algorithm: classic fixed-window counter. For each (key, window) tuple the
// RPC atomically increments a counter; when the count exceeds the caller-
// supplied limit, this helper throws RateLimitExceededError.
//
// Window-boundary semantics: windowStart = floor(now / windowSeconds) *
// windowSeconds. All Deno worker instances that observe now() inside the
// same window compute the same windowStart, so concurrent UPSERTs collapse
// onto the same row.
//
// The supabase client MUST be created with the service_role key. The RPC
// is REVOKE PUBLIC / GRANT TO service_role, so authenticated / anon callers
// cannot bypass it.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface CheckRateLimitOptions {
    key: string;
    limit: number;
    windowSeconds: number;
}

export class RateLimitExceededError extends Error {
    readonly key: string;
    readonly limit: number;
    readonly retryAfterSeconds: number;

    constructor(key: string, limit: number, retryAfterSeconds: number) {
        super(
            `Rate limit exceeded for "${key}" (limit: ${limit} per window). ` +
            `Retry in ${retryAfterSeconds}s.`
        );
        this.name = "RateLimitExceededError";
        this.key = key;
        this.limit = limit;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

/**
 * Applies a fixed-window rate limit check. Atomically increments the
 * counter for `key` in the current window and throws
 * `RateLimitExceededError` when the resulting count exceeds `limit`.
 *
 * Fail-closed on DB errors: any failure of the underlying RPC is
 * propagated as a generic Error so the caller surfaces it as 500. We do
 * not silently allow requests through when the rate-limit storage is
 * unreachable — that would defeat the protection.
 *
 * @param supabase Supabase client created with the service_role key.
 * @param options  key (any string the caller composes — typically
 *                 "<scope>:<id>:<endpoint>"), limit (max events per
 *                 window), windowSeconds (window size in seconds).
 * @throws RateLimitExceededError when the limit is hit.
 * @throws Error on configuration mistakes or RPC failures.
 */
export async function checkRateLimit(
    supabase: SupabaseClient,
    options: CheckRateLimitOptions
): Promise<void> {
    const { key, limit, windowSeconds } = options;

    if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error(`Invalid rate limit configuration: limit=${limit}`);
    }
    if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
        throw new Error(
            `Invalid rate limit configuration: windowSeconds=${windowSeconds}`
        );
    }
    if (typeof key !== "string" || key.length === 0) {
        throw new Error("Invalid rate limit configuration: empty key");
    }

    // Compute the deterministic boundary of the current window.
    const nowMs = Date.now();
    const windowSizeMs = windowSeconds * 1000;
    const windowStartMs = Math.floor(nowMs / windowSizeMs) * windowSizeMs;
    const windowStart = new Date(windowStartMs).toISOString();

    const { data, error } = await supabase.rpc("increment_rate_limit", {
        p_bucket_key: key,
        p_window_start: windowStart
    });

    if (error) {
        // Fail-closed: surface as a generic error so the Edge Function
        // returns 500. Better than silently disabling protection.
        throw new Error(`Rate limit check failed: ${error.message}`);
    }

    // supabase-js can deliver scalar RPC results either as a bare value or
    // as a single-element array depending on the function's RETURNS shape.
    const count = _extractCount(data);

    if (count > limit) {
        const retryAfterSeconds = Math.max(
            1,
            Math.ceil((windowStartMs + windowSizeMs - nowMs) / 1000)
        );
        throw new RateLimitExceededError(key, limit, retryAfterSeconds);
    }
}

function _extractCount(data: unknown): number {
    if (typeof data === "number") return data;
    if (Array.isArray(data) && data.length > 0) {
        const first = data[0];
        if (typeof first === "number") return first;
        if (first && typeof first === "object" && "count" in first) {
            const c = (first as { count: unknown }).count;
            if (typeof c === "number") return c;
        }
    }
    if (data && typeof data === "object" && "count" in data) {
        const c = (data as { count: unknown }).count;
        if (typeof c === "number") return c;
    }
    // Unexpected shape: treat as a configuration/integration bug rather
    // than as a silent allow.
    throw new Error(
        `Rate limit RPC returned an unexpected payload shape: ${JSON.stringify(data)}`
    );
}
