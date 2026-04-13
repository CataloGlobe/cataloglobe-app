import type { VerticalType, BusinessSubtype } from "@/constants/verticalTypes";

export type PlanCode = "pro";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "suspended" | "canceled";

export interface V2Tenant {
    id: string;
    owner_user_id: string;
    name: string;
    vertical_type: VerticalType;
    business_subtype: BusinessSubtype | null;
    created_at: string;
    user_role?: "owner" | "admin" | "member";
    logo_url?: string | null;
    plan: PlanCode;
    subscription_status: SubscriptionStatus;
    trial_until: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    paid_seats: number;
}
