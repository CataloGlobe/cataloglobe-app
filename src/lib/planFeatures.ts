// ============================================================
// Plan → feature entitlement helpers (UX gating only).
//
// This module is for FRONTEND UX gating only — it decides what
// the UI shows / hides based on the tenant's current plan.
// The real enforcement is server-side via `plans.features_json`
// and the `public.activity_has_feature` RPC; never trust this
// helper alone for security-sensitive checks.
//
// PLAN_FEATURES mirrors the `features_json` column on the
// `plans` table. Keep them in sync — every divergence is a bug.
// Source of truth: migration
//   20260606140100_seed_plans_base_pro_and_backfill_tenants.sql
//     base: {}
//     pro:  { table_reservation: true, table_ordering: true }
// ============================================================

import { useTenant } from "@/context/useTenant";
import type { PlanCode } from "@/types/plan";

export type PlanFeature = "table_ordering" | "table_reservation";

const PLAN_FEATURES: Record<PlanCode, Record<PlanFeature, boolean>> = {
    base: { table_ordering: false, table_reservation: false },
    pro:  { table_ordering: true,  table_reservation: true  }
};

/**
 * Pure entitlement check. Loading-optimistic: when the plan is not
 * yet known (null/undefined), returns `true` so the UI does not
 * flash a locked state during initial hydration — same pattern the
 * Sidebar uses when `permissions === null`.
 */
export function hasFeature(plan: PlanCode | null | undefined, feature: PlanFeature): boolean {
    if (plan === null || plan === undefined) return true;
    return PLAN_FEATURES[plan][feature];
}

/**
 * Hook flavour: reads the current tenant's plan from `useTenant()`
 * and exposes a curried `hasFeature(feature)` plus the raw `plan`
 * value. No new context provider — reuses `useTenant()` so it can
 * only be called from components mounted under `TenantProvider`.
 */
export function usePlanFeatures(): {
    plan: PlanCode | null;
    hasFeature: (feature: PlanFeature) => boolean;
} {
    const { selectedTenant } = useTenant();
    const plan = (selectedTenant?.plan ?? null) as PlanCode | null;
    return {
        plan,
        hasFeature: (feature: PlanFeature) => hasFeature(plan, feature)
    };
}
