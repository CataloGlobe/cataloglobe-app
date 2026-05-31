import { supabase } from "@/services/supabase/client";
import type { TenantMemberRow } from "@/types/team";

/**
 * Lista tutti i membri (active + pending) di un tenant.
 *
 * Usa la RPC get_tenant_members(p_tenant_id) v2
 * (migration 20260530180000_get_tenant_members_v2). Auth: team.read.
 * Ritorna sempre un array (mai null).
 */
export async function listTenantMembers(tenantId: string): Promise<TenantMemberRow[]> {
    const { data, error } = await supabase
        .rpc("get_tenant_members", { p_tenant_id: tenantId });
    if (error) throw error;
    return (data as TenantMemberRow[]) ?? [];
}

/**
 * Soft-delete di una membership tenant (UPDATE status='left' + DELETE tma rows).
 *
 * Wrapper su RPC remove_tenant_member(p_membership_id) v2
 * (migration 20260530220000). Errori attesi:
 *   - 42501: caller non autorizzato / self-removal / owner target
 *   - 44000: membership non trovata
 *   - 22023: membership già in stato terminale (left/revoked/expired)
 */
export async function removeTenantMember(membershipId: string): Promise<void> {
    const { error } = await supabase.rpc("remove_tenant_member", {
        p_membership_id: membershipId
    });
    if (error) throw error;
}

/**
 * Tipo locale per gli inviti pending ritornati da get_my_pending_invites v2
 * (migration 20260530240000). Schema parallelo a TenantMemberRow per
 * coerenza display lato InviteModal workspace.
 */
export type PendingInviteRow = {
    membership_id: string;
    tenant_id: string;
    tenant_name: string;
    invite_token: string | null;
    effective_role: string;
    status: string;
    inviter_email: string | null;
    activity_ids: string[];
    activity_names: string[];
};

/**
 * Lista gli inviti pending destinati all'utente corrente.
 *
 * Usa la RPC get_my_pending_invites() v2 (migration 20260530240000).
 * Filtra internamente via auth.uid() / auth.email() ed esclude inviti
 * scaduti e quelli creati dal caller stesso.
 *
 * Ritorna sempre un array (mai null).
 */
export async function listMyPendingInvites(): Promise<PendingInviteRow[]> {
    const { data, error } = await supabase
        .rpc("get_my_pending_invites");
    if (error) throw error;
    return (data as PendingInviteRow[]) ?? [];
}
