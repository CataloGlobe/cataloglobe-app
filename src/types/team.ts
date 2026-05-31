/**
 * Shape della riga ritornata dalla RPC `public.get_tenant_members(uuid)` v2
 * (migration 20260530180000_get_tenant_members_v2).
 *
 * Owner synthetic row:
 *   - membership_id = OWNER_MEMBERSHIP_SENTINEL
 *   - status = NULL
 *   - effective_role = 'owner'
 *   - activity_ids/names = []
 *
 * Membership rows:
 *   - effective_role calcolato server-side da tm.role + tma.role priority
 *   - status IN ('active','pending','revoked','expired','declined')
 *   - activity_ids/names paralleli (stesso ordering per activity_id)
 */
export type EffectiveRole = "owner" | "admin" | "manager" | "staff" | "viewer";

export type MembershipStatus = "active" | "pending" | "revoked" | "expired" | "declined";

export const OWNER_MEMBERSHIP_SENTINEL = "00000000-0000-0000-0000-000000000000";

export type TenantMemberRow = {
    membership_id: string;
    user_id: string | null;
    email: string;
    effective_role: EffectiveRole;
    /** NULL solo per owner synthetic row */
    status: MembershipStatus | null;
    activity_ids: string[];
    activity_names: string[];
    invited_at: string | null;
    invited_by_email: string | null;
    invite_expires_at: string | null;
    created_at: string;
};
