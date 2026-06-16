import type { VerticalType, BusinessSubtype } from "@/constants/verticalTypes";

export type PlanCode = "base" | "pro";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "suspended" | "canceled";

export type LegalEntityType = "societa" | "professionista" | "associazione";

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
    is_founder?: boolean | null;
    current_period_end?: string | null;

    // --- Campi legali/fiscali (migration 20260518095654_add_legal_fields_to_tenants) ---
    legal_name?: string | null;
    vat_number?: string | null;
    fiscal_code?: string | null;
    ateco?: string | null;
    rea_code?: string | null;

    // --- Anagrafica intestatario fattura (migration 20260616120000_add_billing_entity_fields_to_tenants) ---
    legal_entity_type?: LegalEntityType | null;
    first_name?: string | null;
    last_name?: string | null;
    codice_destinatario?: string | null;

    // Indirizzo sede legale (pattern activities)
    address?: string | null;
    street_number?: string | null;
    postal_code?: string | null;
    city?: string | null;
    province?: string | null;
    country?: string | null;

    // Contatti legali
    pec?: string | null;
}
