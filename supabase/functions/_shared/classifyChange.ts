// Pure, side-effect-free classification of a subscription change into three
// independent axes (tier, seats, billing interval) plus the routing decision.
// Extracted for unit-testability: the Stripe sequence wrapped around it is not
// locally testable (no Stripe mock, Deno not installed in CI).
//
// Principle: value increases bill immediately and prorated; value decreases are
// deferred to renewal. Tier and seats are decided INDEPENDENTLY so that a tier
// downgrade can no longer swallow a simultaneous seat increase (the bug fixed
// by FASE 2b).
//
// Billing interval (passo 4): a third axis that only ever moves ALONE. When
// both intervals are omitted or equal, the routing is byte-identical to the
// two-axis version — that is every change that exists today. A change of
// interval combined with a tier or seat change is rejected explicitly
// (`interval-mixed`) rather than falling into an existing branch.

export type AxisDir = "up" | "same" | "down";

export type ChangeRoute =
    | "no-op"
    | "upgrade"
    | "downgrade"
    | "combined-downgrade-seats-up"
    // month → year: immediate, prorated (dedicated path, NOT `upgrade`).
    | "interval-up"
    // year → month: deferred to renewal (dedicated path, NOT `downgrade`).
    | "interval-down"
    // interval change together with a tier and/or seat change: refused.
    | "interval-mixed";

export type BillingInterval = "month" | "year";

export interface ClassifyChangeInput {
    currentPlan: string;
    currentSeats: number;
    targetPlan: string;
    targetSeats: number;
    /** Omit both (or pass equal values) to get the two-axis behaviour. */
    currentInterval?: BillingInterval | null;
    targetInterval?: BillingInterval | null;
}

export interface ClassifyChangeResult {
    tierDir: AxisDir;
    seatDir: AxisDir;
    intervalDir: AxisDir;
    route: ChangeRoute;
}

// Plan rank: higher = more valuable tier. Unknown plans rank 0, matching the
// edge function's defensive fallback.
const PLAN_RANK: Record<string, number> = { base: 0, pro: 1 };

// Interval rank: a longer commitment is "up" (billed now), a shorter one is
// "down" (deferred), mirroring the tier axis.
const INTERVAL_RANK: Record<BillingInterval, number> = { month: 0, year: 1 };

function planRank(plan: string): number {
    return PLAN_RANK[plan] ?? 0;
}

function axisDir(current: number, target: number): AxisDir {
    if (target > current) return "up";
    if (target < current) return "down";
    return "same";
}

function intervalAxisDir(
    current: BillingInterval | null | undefined,
    target: BillingInterval | null | undefined
): AxisDir {
    // No target (legacy caller) or unknown current: the axis does not move.
    if (!current || !target || current === target) return "same";
    return axisDir(INTERVAL_RANK[current], INTERVAL_RANK[target]);
}

export function classifyChange(input: ClassifyChangeInput): ClassifyChangeResult {
    const curRank = planRank(input.currentPlan);
    const tgtRank = planRank(input.targetPlan);
    const tierDir: AxisDir = tgtRank > curRank ? "up" : tgtRank < curRank ? "down" : "same";
    const seatDir = axisDir(input.currentSeats, input.targetSeats);
    const intervalDir = intervalAxisDir(input.currentInterval, input.targetInterval);

    let route: ChangeRoute;
    if (intervalDir !== "same") {
        // The interval moves alone or not at all.
        if (tierDir !== "same" || seatDir !== "same") route = "interval-mixed";
        else route = intervalDir === "up" ? "interval-up" : "interval-down";
    } else if (tierDir === "up") {
        // Tier increase always bills immediately; the seat change rides along on
        // the same immediate update regardless of its direction.
        route = "upgrade";
    } else if (tierDir === "same") {
        if (seatDir === "up") route = "upgrade";
        else if (seatDir === "down") route = "downgrade";
        else route = "no-op";
    } else {
        // tierDir === "down": deferred tier change. A simultaneous seat INCREASE
        // is the only case needing the combined sequence (immediate seats then
        // deferred tier); seat same or down stay fully deferred.
        route = seatDir === "up" ? "combined-downgrade-seats-up" : "downgrade";
    }

    return { tierDir, seatDir, intervalDir, route };
}
