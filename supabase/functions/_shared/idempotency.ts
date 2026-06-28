// Deterministic Stripe idempotency keys for billing mutations.
//
// A key encodes the full transition identity — tenant, subscription, from-state
// and to-state — plus an `operation` discriminator. The same logical transition
// retried produces the SAME key, so Stripe replays the cached response instead
// of repeating the mutation. A different transition produces a different key.
//
// IMPORTANT: deterministic keys are safe only for NON-reversible, charge- or
// create-style mutations (checkout session, seat upgrade with proration,
// schedule create and update). Reversible toggles such as cancel_at_period_end
// must NOT use deterministic keys: a legitimate re-toggle inside Stripe's 24h
// idempotency window would be swallowed as a replay. See stripe-helpers.ts.
//
// Stripe accepts idempotency keys up to 255 characters; the keys built here stay
// well under that bound.

export type BillingOperation =
    | "upgrade"
    | "downgrade-create"
    | "downgrade-update"
    | "downgrade-update-phases"
    | "seats"
    | "downgrade"
    // FASE 2.3 — one-off charge-first per B2 (aggiunta sedi su schedule pendente).
    // Tre call distinte, key stabili sulla transizione → replay sicuro sul retry.
    | "seats-oneoff-item"
    | "seats-oneoff-create"
    | "seats-oneoff-pay"
    // FASE 2.4 — B5: modifica in-place del bersaglio futuro di un cambio
    // programmato (€0, solo fase futura). Operation dedicata per non collidere
    // con l'update-fasi di B2.
    | "scheduled-update";

export interface IdempotencyKeyParams {
    operation: BillingOperation;
    tenantId: string;
    subscriptionId?: string | null;
    currentPlan?: string | null;
    currentSeats?: number | null;
    targetPlan?: string | null;
    targetSeats?: number | null;
}

const MAX_KEY_LENGTH = 255;

/** Normalize a single key segment to a safe, lowercase, stable token. */
function segment(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === "") return "_";
    return String(value).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

/**
 * Build a deterministic idempotency key identifying a billing transition.
 * Stable for a given (operation, tenant, subscription, from-state, to-state);
 * distinct transitions yield distinct keys.
 */
export function buildIdempotencyKey(params: IdempotencyKeyParams): string {
    const from = `${segment(params.currentPlan)}x${segment(params.currentSeats)}`;
    const to = `${segment(params.targetPlan)}x${segment(params.targetSeats)}`;
    const key = [
        "cg",
        segment(params.operation),
        segment(params.tenantId),
        segment(params.subscriptionId),
        `${from}-to-${to}`
    ].join(":");
    return key.length > MAX_KEY_LENGTH ? key.slice(0, MAX_KEY_LENGTH) : key;
}
