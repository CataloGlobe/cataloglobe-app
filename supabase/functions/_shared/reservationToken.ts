// ⚠️ SYNC: unico punto di lettura di RESERVATION_TOKEN_SECRET. Firma e
// verifica del token di disdetta DEVONO passare da questo modulo
// (signReservationToken / verifyReservationToken).
//
// Signed cancellation link handed to a diner by email. The diner has no
// account and never authenticates: the token IS the authorization, so the
// edge function verifies it and then acts with service_role. There is no anon
// RLS policy on `reservations` and there must not be one — what a customer may
// do stays in a single place.
//
// ── Why this is NOT a JWT, and not `customerJwt.ts` ─────────────────────────
// `_shared/customerJwt.ts` is not a generic signer: it mints tokens that are
// deliberately *valid Supabase credentials*. The `role: "anon"` and
// `aud: "authenticated"` claims exist so PostgREST and the realtime server
// accept them and switch the Postgres session role, activating RLS policies.
// Parametrising it would turn it into something that can emit tokens which
// look like database credentials — the exact confusion worth avoiding when the
// token travels through email clients, forwarded messages and browser history.
//
// A cancellation token must be inert towards the database. So: an opaque
// format of our own, verified only by this module and honoured only by the
// cancellation endpoint. Leaked, it grants exactly one thing — the ability to
// look at and cancel one reservation.
//
// ── Format ──────────────────────────────────────────────────────────────────
//   v1.<payload_b64url>.<signature_b64url>
//   payload   = JSON {"rid": "<reservation uuid>", "act": "cancel" | "confirm"}
//   signature = HMAC-SHA256(RESERVATION_TOKEN_SECRET, "v1.<payload_b64url>")
//
// The version prefix is inside the signed material, so it cannot be swapped to
// downgrade a future v2 into v1 verification.
//
// ── The `act` claim ─────────────────────────────────────────────────────────
// A diner now receives two links that mean opposite things: cancel the booking,
// and confirm they are coming. Without a claim naming the operation the two
// tokens would be interchangeable — same secret, same payload, same signature —
// and a cancellation link would silently work as a confirmation. That is not a
// theoretical mix-up: both links sit in the same email, one above the other.
//
// Verification therefore takes the expected operation and rejects a mismatch.
//
// Backward compatibility: tokens minted before this claim existed are already
// in inboxes and carry no `act`. A payload without the claim is read as
// "cancel", which is what those links were issued for. No dead links, no
// version bump.
//
// ── No expiry, by design ────────────────────────────────────────────────────
// The token is valid as long as the reservation makes sense. What actually
// gates cancellation is the reservation status (state machine) and the
// per-venue cutoff (`_shared/reservationCancellation.ts`), both re-checked
// server side on every call. An `exp` would add a stored/rotating concern and
// a class of "link expired the day before dinner" failures, buying nothing.
//
// ── Fail-closed ─────────────────────────────────────────────────────────────
// Missing secret, unknown version, malformed structure, undecodable payload,
// bad signature, missing or non-UUID `rid`: every one of them throws. No
// branch returns a partial or permissive result.
//
// Env consumed (read lazily, so the module imports cleanly in tests):
//   - RESERVATION_TOKEN_SECRET → HMAC key. Deliberately distinct from the
//     secret used by `customerJwt.ts`: different domain, different lifecycle,
//     and rotating one must not invalidate the other. The name of that other
//     secret is not repeated here — `customerJwtCentralization.test.ts` keeps
//     it to a single file, and that guardrail is worth more than the sentence.

const ENV_KEY = "RESERVATION_TOKEN_SECRET";
const VERSION = "v1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What a token authorises. One token, one operation.
 *
 * `cancel` is also the value assumed for legacy payloads that predate the
 * claim — see the header.
 */
export type ReservationTokenAction = "cancel" | "confirm";

const RESERVATION_TOKEN_ACTIONS: readonly ReservationTokenAction[] = ["cancel", "confirm"];

/** Meaning of a payload with no `act` claim: the links already in the wild. */
const LEGACY_ACTION: ReservationTokenAction = "cancel";

export interface ReservationTokenPayload {
    /** UUID of the `public.reservations` row this token unlocks. */
    reservationId: string;
    /** Operation the token authorises, and nothing else. */
    action: ReservationTokenAction;
}

/** Thrown for every rejection path. Callers map it to a single generic error. */
export class InvalidReservationTokenError extends Error {
    constructor(reason: string) {
        super(`Invalid reservation token: ${reason}`);
        this.name = "InvalidReservationTokenError";
    }
}

function readSecret(): string {
    // Deno.env is typed only inside the edge runtime; the module is also
    // imported by vitest, which stubs `globalThis.Deno`.
    const env = (globalThis as { Deno?: { env: { get(key: string): string | undefined } } }).Deno;
    const secret = env?.env.get(ENV_KEY);
    if (!secret || secret.trim().length === 0) {
        // Not an InvalidReservationTokenError: a missing secret is a
        // deployment fault, not a bad token, and must not be reported to the
        // caller as "your link is invalid".
        throw new Error(`${ENV_KEY} environment variable is not set`);
    }
    return secret;
}

async function getKey(): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(readSecret()),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
    );
}

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
        throw new InvalidReservationTokenError("segment is not base64url");
    }
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
        value.length + ((4 - (value.length % 4)) % 4),
        "="
    );
    let binary: string;
    try {
        binary = atob(padded);
    } catch {
        throw new InvalidReservationTokenError("segment is not decodable");
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/**
 * Signs a token authorising ONE operation on one reservation.
 *
 * @param reservationId UUID of the `public.reservations` row.
 * @param action What the link may do. Explicit at every call site: the default
 *               exists only so the pre-`act` signature keeps compiling, and
 *               new callers should say what they mean.
 * @returns `v1.<payload>.<signature>`, safe to put in a URL query string.
 */
export async function signReservationToken(
    reservationId: string,
    action: ReservationTokenAction = LEGACY_ACTION
): Promise<string> {
    if (typeof reservationId !== "string" || !UUID_RE.test(reservationId.trim())) {
        throw new Error("signReservationToken: reservationId must be a UUID");
    }
    if (!RESERVATION_TOKEN_ACTIONS.includes(action)) {
        throw new Error(`signReservationToken: unknown action "${action}"`);
    }
    const payload = JSON.stringify({ rid: reservationId.trim().toLowerCase(), act: action });
    const body = `${VERSION}.${bytesToBase64Url(new TextEncoder().encode(payload))}`;
    const signature = await crypto.subtle.sign(
        "HMAC",
        await getKey(),
        new TextEncoder().encode(body)
    );
    return `${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/**
 * Verifies a token and returns its payload.
 *
 * @param expectedAction The operation the CALLER is about to perform. A token
 *        minted for the other operation is rejected: a cancellation link must
 *        not confirm attendance, and a confirmation link must not cancel.
 *        Payloads with no `act` claim count as "cancel" (see the header).
 *
 * Throws `InvalidReservationTokenError` on every rejection path, with a reason
 * meant for server logs only — callers must surface a single generic error so
 * the endpoint does not become an oracle.
 */
export async function verifyReservationToken(
    token: unknown,
    expectedAction: ReservationTokenAction = LEGACY_ACTION
): Promise<ReservationTokenPayload> {
    if (typeof token !== "string" || token.length === 0) {
        throw new InvalidReservationTokenError("empty or non-string token");
    }

    const parts = token.split(".");
    if (parts.length !== 3) {
        throw new InvalidReservationTokenError("expected 3 dot-separated segments");
    }
    const [version, payloadSegment, signatureSegment] = parts;
    if (version !== VERSION) {
        throw new InvalidReservationTokenError(`unknown version "${version}"`);
    }
    if (payloadSegment.length === 0 || signatureSegment.length === 0) {
        throw new InvalidReservationTokenError("empty segment");
    }

    // `crypto.subtle.verify` compares in constant time — never hand-roll the
    // signature comparison here.
    const signature = base64UrlToBytes(signatureSegment);
    const body = new TextEncoder().encode(`${version}.${payloadSegment}`);
    const valid = await crypto.subtle.verify("HMAC", await getKey(), signature, body);
    if (!valid) {
        throw new InvalidReservationTokenError("signature mismatch");
    }

    let decoded: unknown;
    try {
        decoded = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadSegment)));
    } catch (err) {
        if (err instanceof InvalidReservationTokenError) throw err;
        throw new InvalidReservationTokenError("payload is not JSON");
    }

    const rid = (decoded as { rid?: unknown } | null)?.rid;
    if (typeof rid !== "string" || !UUID_RE.test(rid)) {
        throw new InvalidReservationTokenError("payload has no valid rid");
    }

    // Absent claim = legacy token, issued when cancelling was the only thing a
    // link could do. Anything present but unrecognised is rejected rather than
    // coerced: an unknown operation is not a cancellation.
    const rawAct = (decoded as { act?: unknown } | null)?.act;
    let action: ReservationTokenAction;
    if (rawAct === undefined || rawAct === null) {
        action = LEGACY_ACTION;
    } else if (
        typeof rawAct === "string" &&
        RESERVATION_TOKEN_ACTIONS.includes(rawAct as ReservationTokenAction)
    ) {
        action = rawAct as ReservationTokenAction;
    } else {
        throw new InvalidReservationTokenError("payload has an unknown act");
    }

    if (action !== expectedAction) {
        throw new InvalidReservationTokenError(
            `act mismatch: token authorises "${action}", caller expected "${expectedAction}"`
        );
    }

    return { reservationId: rid.toLowerCase(), action };
}
