// Pure, side-effect-free classification of a subscription change into two
// independent axes (tier and seats) plus the routing decision. Extracted for
// unit-testability: the Stripe sequence wrapped around it is not locally
// testable (no Stripe mock, Deno not installed in CI).
//
// Principle: value increases bill immediately and prorated; value decreases are
// deferred to renewal. Tier and seats are decided INDEPENDENTLY so that a tier
// downgrade can no longer swallow a simultaneous seat increase (the bug fixed
// by FASE 2b).

export type AxisDir = "up" | "same" | "down";

export type ChangeRoute =
    | "no-op"
    | "upgrade"
    | "downgrade"
    | "combined-downgrade-seats-up";

export interface ClassifyChangeInput {
    currentPlan: string;
    currentSeats: number;
    targetPlan: string;
    targetSeats: number;
}

export interface ClassifyChangeResult {
    tierDir: AxisDir;
    seatDir: AxisDir;
    route: ChangeRoute;
}

// Plan rank: higher = more valuable tier. Unknown plans rank 0, matching the
// edge function's defensive fallback.
const PLAN_RANK: Record<string, number> = { base: 0, pro: 1 };

function planRank(plan: string): number {
    return PLAN_RANK[plan] ?? 0;
}

function axisDir(current: number, target: number): AxisDir {
    if (target > current) return "up";
    if (target < current) return "down";
    return "same";
}

export function classifyChange(input: ClassifyChangeInput): ClassifyChangeResult {
    const curRank = planRank(input.currentPlan);
    const tgtRank = planRank(input.targetPlan);
    const tierDir: AxisDir = tgtRank > curRank ? "up" : tgtRank < curRank ? "down" : "same";
    const seatDir = axisDir(input.currentSeats, input.targetSeats);

    let route: ChangeRoute;
    if (tierDir === "up") {
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

    return { tierDir, seatDir, route };
}
