import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";
import type { V2Tenant } from "@/types/tenant";

export const DELETED_ACCOUNT_HANDOFF_KEY = "cg_auth_deleted_handoff";

export interface DeletedAccountHandoff {
    email: string;
    reason: "account_deleted";
}

/**
 * Fetches profiles.account_deleted_at for a given user.
 * Returns the ISO timestamp if the account is pending deletion, null if clean.
 * Used by AuthProvider to enforce deleted-account blocking at the app level.
 */
export async function getProfileDeletionStatus(userId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from("profiles")
        .select("account_deleted_at")
        .eq("id", userId)
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        console.warn("[auth] profile not found for deletion check", userId);
    }
    return data?.account_deleted_at ?? null;
}

/**
 * Calls the recover-account Edge Function to restore a deleted account
 * within the 30-day recovery window.
 *
 * No session is required — banned users cannot log in.
 * The email is used server-side to look up the user via the Admin API.
 *
 * Throws:
 *   - "recovery_window_expired" if the 30-day window has passed (410)
 *   - A generic Error for all other failures
 */
export async function recoverAccount(email: string): Promise<void> {
    const { error } = await supabase.functions.invoke("recover-account", {
        body: { email }
    });

    if (!error) return;

    if (error instanceof FunctionsHttpError) {
        const status = error.context.status;
        if (status === 410) {
            throw new Error("recovery_window_expired");
        }
    }

    throw new Error("Impossibile recuperare l'account. Riprova.");
}

export interface TenantMember {
    userId: string;
    displayName: string;
    email: string | null;
}

export interface DeleteAccountAction {
    tenant_id: string;
    action: "transfer" | "lock";
    new_owner_user_id?: string;
}

/**
 * Returns all tenants the current user belongs to, split by ownership.
 * Queries user_tenants_view directly — works without TenantProvider in scope.
 */
export async function listUserTenantsForDeletion(): Promise<{
    owned: V2Tenant[];
    member: V2Tenant[];
}> {
    const { data, error } = await supabase
        .from("user_tenants_view")
        .select("id, owner_user_id, name, vertical_type, business_subtype, created_at, user_role")
        .order("created_at", { ascending: true });

    if (error) throw error;

    const all = (data ?? []) as V2Tenant[];
    return {
        owned: all.filter(t => t.user_role === "owner"),
        member: all.filter(t => t.user_role !== "owner")
    };
}

/**
 * Returns active members of a tenant eligible for ownership transfer.
 * Excludes the current user (the owner initiating the deletion).
 * Includes admins and members — any active user who has accepted their invite.
 */
export async function listActiveTenantMembers(
    tenantId: string,
    currentUserId: string
): Promise<TenantMember[]> {
    const { data, error } = await supabase
        .from("tenant_memberships")
        .select("user_id, invited_email, profiles(first_name, last_name, email)")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .not("user_id", "is", null);

    if (error) throw error;

    return (data ?? [])
        .filter(row => row.user_id !== null && row.user_id !== currentUserId)
        .map(row => {
            const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
            const email = profile?.email ?? row.invited_email ?? null;
            const nameParts = [profile?.first_name, profile?.last_name].filter(Boolean);
            let displayName: string;
            if (nameParts.length > 0) {
                displayName = nameParts.join(" ");
            } else if (email) {
                displayName = email;
            } else {
                displayName = `User ${(row.user_id as string).slice(0, 8)}`;
            }
            return {
                userId: row.user_id as string,
                displayName,
                email
            };
        });
}

/**
 * Initiates account deletion via the delete-account Edge Function.
 *
 * The function:
 * 1. Executes tenant operations (transfer / lock)
 * 2. Writes profiles.account_deleted_at
 * 3. Bans the user via Admin API
 *
 * NOTE: If the user has no owned tenants, actions will be an empty array.
 * The Edge Function must be updated to accept empty arrays in that case.
 */
export async function deleteAccount(actions: DeleteAccountAction[]): Promise<void> {
    const { error } = await supabase.functions.invoke("delete-account", {
        body: { actions }
    });

    if (!error) return;

    if (error instanceof FunctionsHttpError) {
        const status = error.context.status;
        const body = await error.context.json().catch(() => ({}));
        const code: string = body?.error ?? "";

        if (status === 401) {
            throw new Error("Sessione scaduta. Effettua nuovamente il login e riprova.");
        }
        if (status === 400) {
            if (code === "incomplete_actions") {
                throw new Error(
                    "Devi specificare un'azione per ogni azienda di cui sei proprietario."
                );
            }
            if (code === "not_owner_of_tenant") {
                throw new Error("Non sei il proprietario di una delle aziende selezionate.");
            }
            if (code === "invalid_action") {
                throw new Error("Azione non valida per uno dei tenant.");
            }
        }
        if (status === 503) {
            throw new Error("Servizio temporaneamente non disponibile. Riprova tra qualche minuto.");
        }
        if (status === 500) {
            throw new Error("Errore interno del server. Riprova tra qualche minuto.");
        }
    }

    throw new Error("Errore durante l'eliminazione dell'account. Riprova.");
}
