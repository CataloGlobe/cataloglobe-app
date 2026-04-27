import { supabase } from "@/services/supabase/client";
import type { TenantMemberRow } from "@/types/team";

/**
 * Lista tutti i membri (active + pending) di un tenant.
 *
 * Usa la RPC get_tenant_members(p_tenant_id) introdotta dalla migration
 * 20260427100000_security_advisor_fixes. La RPC applica internamente il
 * filtro di accesso (caller deve essere owner o membro attivo del tenant).
 *
 * Ritorna sempre un array (mai null). I membri sono ordinati per
 * created_at ASC. Il filtraggio active/pending e' responsabilita' del
 * chiamante (filtro client-side).
 */
export async function listTenantMembers(tenantId: string): Promise<TenantMemberRow[]> {
    const { data, error } = await supabase
        .rpc("get_tenant_members", { p_tenant_id: tenantId });
    if (error) throw error;
    return (data as TenantMemberRow[]) ?? [];
}

/**
 * Tipo locale per gli inviti pending ritornati da get_my_pending_invites.
 * Le 6 colonne corrispondono esattamente al return type della RPC.
 */
export type PendingInviteRow = {
    membership_id: string;
    tenant_id: string;
    invite_token: string | null;
    role: string;
    status: string;
    inviter_email: string | null;
};

/**
 * Lista gli inviti pending destinati all'utente corrente.
 *
 * Usa la RPC get_my_pending_invites() introdotta dalla migration
 * 20260427100000_security_advisor_fixes. La RPC filtra internamente via
 * auth.uid() / auth.email() ed esclude gli inviti scaduti e quelli creati
 * dal caller stesso.
 *
 * Ritorna sempre un array (mai null).
 */
export async function listMyPendingInvites(): Promise<PendingInviteRow[]> {
    const { data, error } = await supabase
        .rpc("get_my_pending_invites");
    if (error) throw error;
    return (data as PendingInviteRow[]) ?? [];
}
