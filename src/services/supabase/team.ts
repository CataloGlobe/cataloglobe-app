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

/**
 * Mappa `user_id → display_name` per owner + membri attivi del tenant.
 *
 * Wrapper su RPC `public.get_tenant_member_names(p_tenant_id)` (migration
 * 20260608164213). Gated lato server su membership (qualsiasi ruolo: owner /
 * admin / manager / staff / viewer). Usata per attribuire le comande manuali
 * all'operatore sulla board Ordini.
 *
 * Behaviour anti-crash: in caso di errore RPC (RPC non ancora applicata in un
 * ambiente, 401/403, network, schema mismatch) ritorna una Map vuota. Il caller
 * UI fa fallback al label generico "Staff" senza rompere il render.
 *
 * Filtra `display_name` null/vuoti (caller deve poter fare `.get(id) ?? "Staff"`
 * senza dover ri-controllare il valore restituito).
 */
export async function getTenantMemberNames(
    tenantId: string
): Promise<Map<string, string>> {
    type Row = { user_id: string | null; display_name: string | null };
    const { data, error } = await supabase.rpc("get_tenant_member_names", {
        p_tenant_id: tenantId
    });
    if (error) {
        console.warn("[getTenantMemberNames] RPC error:", error.message);
        return new Map();
    }
    const rows = (data ?? []) as Row[];
    const out = new Map<string, string>();
    for (const row of rows) {
        if (!row.user_id) continue;
        const name = row.display_name?.trim();
        if (!name) continue;
        out.set(row.user_id, name);
    }
    return out;
}

/** Rispedisce l'email di un invito in attesa. RPC `resend_invite`. Errori
 *  attesi nel messaggio: «cannot resend invite to an active member»,
 *  «not allowed». */
export async function resendInvite(membershipId: string): Promise<void> {
    const { error } = await supabase.rpc("resend_invite", { p_membership_id: membershipId });
    if (error) throw error;
}

/** Annulla un invito in attesa (il link smette di funzionare). RPC
 *  `revoke_invite`. Errori attesi nel messaggio: «not allowed», «member not
 *  found». */
export async function revokeInvite(membershipId: string): Promise<void> {
    const { error } = await supabase.rpc("revoke_invite", { p_membership_id: membershipId });
    if (error) throw error;
}

/**
 * Invita una persona nell'azienda. RPC `invite_tenant_member`: `activityIds`
 * è `null` per l'amministratore (tenant-wide). Ritorna l'id della
 * membership creata. Errori attesi nel messaggio: «user already member»,
 * «invite already pending»; codici 42501 / 22023 / 44000.
 */
export async function inviteTenantMember(
    tenantId: string,
    email: string,
    role: "admin" | "manager" | "staff" | "viewer",
    activityIds: string[] | null
): Promise<string> {
    const { data, error } = await supabase.rpc("invite_tenant_member", {
        p_tenant_id: tenantId,
        p_email: email,
        p_role: role,
        p_activity_ids: activityIds
    });
    if (error) throw error;
    return typeof data === "string" ? data : "";
}
