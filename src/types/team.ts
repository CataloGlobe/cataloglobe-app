/**
 * Shared type for tenant membership rows returned by `tenant_members_view`.
 * Used by Business/TeamPage and MemberDrawer.
 */
export type TenantMemberRow = {
    membership_id: string;
    tenant_id: string;
    user_id: string | null;
    email: string | null;
    role: string;
    status: string;
    invited_by: string | null;
    inviter_email: string | null;
    invite_token: string | null;
    invite_expires_at: string | null;
    created_at: string;
};
