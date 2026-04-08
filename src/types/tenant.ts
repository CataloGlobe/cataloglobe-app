import type { VerticalType, BusinessSubtype } from "@/constants/verticalTypes";

export interface V2Tenant {
    id: string;
    owner_user_id: string;
    name: string;
    vertical_type: VerticalType;
    business_subtype: BusinessSubtype | null;
    created_at: string;
    user_role?: "owner" | "admin" | "member";
    logo_url?: string | null;
}
