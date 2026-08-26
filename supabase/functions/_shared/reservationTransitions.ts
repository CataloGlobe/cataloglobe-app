// Reservation state machine for the admin-driven transitions exposed by
// `respond-reservation`. Pure data + pure predicates: no I/O, no Deno API, so
// the matrix is unit-testable without spinning up the edge function.
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
 * Admin actions. `mark_no_show` / `undo_no_show` are the no-show pair:
 * marking is reachable only from `confirmed` (a request that was never
 * accepted cannot be a no-show), and it is reversible because the value feeds
 * a future reliability score — a mis-click must be correctable.
 */
export type ReservationAction =
    | "confirm"
    | "decline"
    | "cancel"
    | "mark_no_show"
    | "undo_no_show";

export const RESERVATION_ACTIONS: readonly ReservationAction[] = [
    "confirm",
    "decline",
    "cancel",
    "mark_no_show",
    "undo_no_show"
];

export function isReservationAction(value: unknown): value is ReservationAction {
    return (
        typeof value === "string" &&
        (RESERVATION_ACTIONS as readonly string[]).includes(value)
    );
}

/** Target status each action writes. */
export const ACTION_TO_STATUS: Record<ReservationAction, ReservationStatus> = {
    confirm:      "confirmed",
    decline:      "declined",
    cancel:       "cancelled",
    mark_no_show: "no_show",
    undo_no_show: "confirmed"
};

/**
 * Required source status. Doubles as the compare-and-set guard: the UPDATE
 * runs with `.eq("status", ACTION_EXPECTS[action])`, so a concurrent admin
 * cannot race us into a duplicate transition (or a duplicate email).
 */
export const ACTION_EXPECTS: Record<ReservationAction, ReservationStatus> = {
    confirm:      "pending",
    decline:      "pending",
    cancel:       "confirmed",
    mark_no_show: "confirmed",
    undo_no_show: "no_show"
};

/** Whether `action` can be applied to a row currently in `currentStatus`. */
export function isTransitionAllowed(
    currentStatus: string,
    action: ReservationAction
): boolean {
    return currentStatus === ACTION_EXPECTS[action];
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
    "undo_no_show"
]);

export function sendsCustomerEmail(action: ReservationAction): boolean {
    return !SILENT_ACTIONS.has(action);
}

/** Actions that do produce a customer email — narrows the email builder input. */
export type ReservationEmailAction = Exclude<
    ReservationAction,
    "mark_no_show" | "undo_no_show"
>;
