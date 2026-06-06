import { supabase } from "./client";
import type { Plan } from "@/types/plan";

const PLAN_COLUMNS = "code, name, description, monthly_price_cents, stripe_price_id, features_json, sort_order, is_public, volume_discount_threshold, volume_discount_percent, max_self_service_seats";

export async function listPublicPlans(): Promise<Plan[]> {
    const { data, error } = await supabase
        .from("plans")
        .select(PLAN_COLUMNS)
        .eq("is_public", true)
        .order("sort_order", { ascending: true });

    if (error) throw error;
    return (data as Plan[]) ?? [];
}
