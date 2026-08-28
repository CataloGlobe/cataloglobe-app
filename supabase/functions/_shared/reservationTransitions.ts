// Reservation state machine. Pure data + pure predicates: no I/O, no Deno API,
// so the matrix is unit-testable without spinning up the edge function.
//
// Two writers consume it: `respond-reservation` (admin, authenticated) and the
// customer-facing cancellation endpoint reached through a signed email link.
// They share one matrix on purpose — a second copy is how the two drift.
//
// The DB CHECK on `reservations.status` allows seven values (migration
// 20260615140000). This module deliberately covers only the ones the product
// actually drives today: `seated` and `completed` have no UI and no writer,
// and a status nobody updates is worse than one that does not exist.

export type ReservationStatus =
    | "pending"
    | "confirmed"
    | "declined"
    | "cancelled"
    | "seated"
    | "no_show"
    | "completed";

/**
 * `mark_no_show` / `undo_no_show` are the no-show pair: marking is reachable
 * only from `confirmed` (a request that was never accepted cannot be a
 * no-show), and it is reversible because the value feeds a future reliability
 * score — a mis-click must be correctable.
 *
 * `cancel_by_customer` is the only action a non-authenticated party can drive
 * (signed link in the confirmation email). It is distinct from `cancel`
 * because it accepts a source state `cancel` does not: a diner must be able to
 * withdraw a request that the venue has not reviewed yet.
 */
export type ReservationAction =
    | "confirm"
    | "decline"
    | "cancel"
    | "mark_no_show"
    | "undo_no_show"
    | "cancel_by_customer";

export const RESERVATION_ACTIONS: readonly ReservationAction[] = [
    "confirm",
    "decline",
    "cancel",
    "mark_no_show",
    "undo_no_show",
    "cancel_by_customer"
];

export function isReservationAction(value: unknown): value is ReservationAction {
    return (
        typeof value === "string" &&
        (RESERVATION_ACTIONS as readonly string[]).includes(value)
    );
}

/** Actions the authenticated admin endpoint may drive. */
export type AdminReservationAction = Exclude<ReservationAction, "cancel_by_customer">;

/**
 * Allow-list for `respond-reservation`.
 *
 * `cancel_by_customer` is excluded deliberately, not incidentally: it accepts
 * `pending` as a source state, so routing it through the admin handler would
 * silently widen `cancel` by a transition nobody reviewed — and it would do so
 * without the signed-token check that is the whole authorization story on the
 * customer side. A test asserts the rejection, so removing the guard breaks
 * the suite instead of quietly opening the path.
 */
export const ADMIN_ACTIONS: readonly AdminReservationAction[] = [
    "confirm",
    "decline",
    "cancel",
    "mark_no_show",
    "undo_no_show"
];

export function isAdminAction(value: unknown): value is AdminReservationAction {
    return (
        isReservationAction(value) &&
        (ADMIN_ACTIONS as readonly string[]).includes(value)
    );
}

/** Target status each action writes. */
export const ACTION_TO_STATUS: Record<ReservationAction, ReservationStatus> = {
    confirm:            "confirmed",
    decline:            "declined",
    cancel:             "cancelled",
    mark_no_show:       "no_show",
    undo_no_show:       "confirmed",
    cancel_by_customer: "cancelled"
};

/**
 * Accepted source statuses. Doubles as the compare-and-set guard: the UPDATE
 * runs with `.in("status", ACTION_EXPECTS[action])`, so a concurrent writer
 * cannot race us into a duplicate transition (or a duplicate email).
 *
 * The values are lists, not single statuses, because `cancel_by_customer`
 * legitimately starts from two states. For the five single-source actions the
 * generated predicate is `status IN ('x')` — same semantics as the previous
 * `.eq`, same atomicity, since the constraint still travels inside the UPDATE
 * rather than being checked beforehand.
 */
export const ACTION_EXPECTS: Record<ReservationAction, readonly ReservationStatus[]> = {
    confirm:            ["pending"],
    decline:            ["pending"],
    cancel:             ["confirmed"],
    mark_no_show:       ["confirmed"],
    undo_no_show:       ["no_show"],
    cancel_by_customer: ["pending", "confirmed"]
};

/** Whether `action` can be applied to a row currently in `currentStatus`. */
export function isTransitionAllowed(
    currentStatus: string,
    action: ReservationAction
): boolean {
    return (ACTION_EXPECTS[action] as readonly string[]).includes(currentStatus);
}

/**
 * Whether the customer gets an email for this transition.
 *
 * The no-show pair is silent BY DESIGN, and this is not a detail to relax
 * later: telling someone "you did not show up" is aggressive, pointless (they
 * know) and counterproductive. The same goes for undoing the mark — it is an
 * internal correction the diner has no reason to hear about.
 */
const SILENT_ACTIONS: ReadonlySet<ReservationAction> = new Set<ReservationAction>([
    "mark_no_show",
    "undo_no_show",
    // The diner just cancelled, on a page that told them it worked. Mailing
    // them "your reservation was cancelled" adds nothing. The message that
    // matters goes the other way — to the venue, whose table just freed up.
    "cancel_by_customer"
]);

export function sendsCustomerEmail(action: ReservationAction): boolean {
    return !SILENT_ACTIONS.has(action);
}

/** Actions that do produce a customer email — narrows the email builder input. */
export type ReservationEmailAction = Exclude<
    ReservationAction,
    "mark_no_show" | "undo_no_show" | "cancel_by_customer"
>;
