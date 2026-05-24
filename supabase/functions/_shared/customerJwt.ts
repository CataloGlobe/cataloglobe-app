// Custom JWT signing/verification for guest (anon) sessions of the
// table-ordering epic. See docs/orders-architecture.md v1.1 §5.2 for
// the full pattern rationale.
//
// JWTs are signed with CUSTOMER_JWT_SECRET so PostgREST accepts them
// as valid Supabase tokens. The `role: "anon"` claim makes PostgREST
// switch the Postgres session to the `anon` role, activating the
// `TO anon` RLS policies created in task 1.7. The custom
// `customer_session_id` claim is the row filter used by the helper
// function `public.get_jwt_customer_session_id()` inside RLS
// predicates on orders / order_items / order_groups.
//
// Env vars consumed (resolved lazily at first use, not at import time,
// so this module can be imported in test contexts without env setup):
//   - CUSTOMER_JWT_SECRET  → HMAC key for HS256 sign/verify. Must hold
//     the same value as the project JWT secret (Settings → API). The
//     `SUPABASE_` prefix is reserved by the platform for auto-injected
//     secrets, so a custom name is required.
//   - SUPABASE_URL         → used to compose the `iss` claim

import { create, getNumericDate, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const DEFAULT_TTL_SECONDS = 12 * 60 * 60; // 12h, aligned with customer_sessions TTL

export interface CustomerJwtPayload {
    role: "anon";
    sub: string;
    iss: string;
    iat: number;
    exp: number;
    aud: "authenticated";
    customer_session_id: string;
}

async function getSigningKey(): Promise<CryptoKey> {
    const secret = Deno.env.get("CUSTOMER_JWT_SECRET");
    if (!secret) {
        throw new Error("CUSTOMER_JWT_SECRET environment variable is not set");
    }
    return await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
    );
}

/**
 * Signs a customer (guest) JWT bound to a customer_sessions row.
 *
 * The returned token is meant to be handed to the guest's browser and
 * used as the `accessToken` of a supabase-js client. PostgREST will
 * accept it as a valid Supabase token because it is HS256-signed with
 * CUSTOMER_JWT_SECRET; the `role: "anon"` claim activates the
 * `TO anon` RLS policies, and the `customer_session_id` claim scopes
 * the rows visible to the guest.
 *
 * @param customerSessionId UUID of the public.customer_sessions row.
 * @param ttlSeconds Token lifetime in seconds (default: 12h).
 * @returns Encoded JWT string (header.payload.signature).
 */
export async function signCustomerJwt(
    customerSessionId: string,
    ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<string> {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) {
        throw new Error("SUPABASE_URL environment variable is not set");
    }
    const key = await getSigningKey();
    const iat = getNumericDate(0);
    const exp = getNumericDate(ttlSeconds);

    const payload: CustomerJwtPayload = {
        role: "anon",
        sub: customerSessionId,
        iss: `${supabaseUrl}/auth/v1`,
        iat,
        exp,
        aud: "authenticated",
        customer_session_id: customerSessionId
    };

    return await create({ alg: "HS256", typ: "JWT" }, payload, key);
}

/**
 * Verifies a customer JWT and returns its typed payload.
 *
 * Throws on:
 *   - invalid signature
 *   - expired token (`exp` in the past)
 *   - malformed payload (missing `customer_session_id`)
 *   - wrong `role` claim (must be "anon")
 *
 * Callers (Edge Functions) decide how to surface failures — typically
 * a 401 response. This module does not log, to keep telemetry choices
 * at the call site.
 *
 * @param token Encoded JWT string.
 * @returns Decoded payload narrowed to CustomerJwtPayload.
 */
export async function verifyCustomerJwt(token: string): Promise<CustomerJwtPayload> {
    const key = await getSigningKey();
    // djwt's `verify` throws on invalid signature / expired token.
    const payload = await verify(token, key);

    // djwt only checks signature + exp. Validate the semantic claims we
    // depend on (role + customer_session_id) before handing the payload
    // back to callers.
    if (
        typeof payload !== "object" ||
        payload === null ||
        typeof (payload as Record<string, unknown>).customer_session_id !== "string"
    ) {
        throw new Error("Invalid JWT payload: missing customer_session_id");
    }
    const typed = payload as unknown as CustomerJwtPayload;
    if (typed.role !== "anon") {
        throw new Error(`Invalid JWT role: expected "anon", got "${typed.role}"`);
    }
    return typed;
}
