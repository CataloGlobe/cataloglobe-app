export type PlanCode = "base" | "pro";

export interface Plan {
    code: PlanCode;
    name: string;
    description: string | null;
    monthly_price_cents: number | null;
    stripe_price_id: string | null;
    features_json: Record<string, unknown>;
    sort_order: number;
    is_public: boolean;
    volume_discount_threshold: number;
    volume_discount_percent: number;
    max_self_service_seats: number;
}
