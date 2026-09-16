export type PlanCode = "base" | "pro";

/** Billing interval, same domain as Stripe `recurring.interval` for CataloGlobe prices. */
export type BillingInterval = "month" | "year";

export const BILLING_INTERVALS: readonly BillingInterval[] = ["month", "year"];

export interface Plan {
    code: PlanCode;
    name: string;
    description: string | null;
    /** DEPRECATED: display price now comes from `plan_prices` (see `PlanPrice`). */
    monthly_price_cents: number | null;
    features_json: Record<string, unknown>;
    sort_order: number;
    is_public: boolean;
    volume_discount_threshold: number;
    volume_discount_percent: number;
    max_self_service_seats: number;
}

/** One row of `plan_prices`: the display price of a plan for a billing interval. */
export interface PlanPrice {
    plan_code: PlanCode;
    billing_interval: BillingInterval;
    /** First-seat unit price for the interval, in cents (3900 monthly, 39000 yearly). */
    price_cents: number;
}
