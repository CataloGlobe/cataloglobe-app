import { supabase } from "./client";
import type { PlanPrice } from "@/types/plan";

// `plan_prices` is a public lookup table (RLS: SELECT for authenticated).
// `stripe_price_id` is deliberately not selected: the frontend never needs it,
// the edge functions resolve the Price server-side.
const PLAN_PRICE_COLUMNS = "plan_code, billing_interval, price_cents";

export async function listPlanPrices(): Promise<PlanPrice[]> {
    const { data, error } = await supabase
        .from("plan_prices")
        .select(PLAN_PRICE_COLUMNS)
        .order("plan_code", { ascending: true })
        .order("billing_interval", { ascending: true });

    if (error) throw error;
    return (data as PlanPrice[]) ?? [];
}
