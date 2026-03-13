export interface V2Tenant {
    id: string;
    owner_user_id: string;
    name: string;
    vertical_type: string;
    created_at: string;
    user_role?: "owner" | "member";
}
