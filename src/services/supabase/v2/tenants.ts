import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";

export interface DeletedTenant {
    id: string;
    name: string;
    vertical_type: string;
    created_at: string;
    deleted_at: string;
}

/**
 * Soft-deletes a tenant via the delete-tenant edge function.
 *
 * The edge function verifies that the caller is the tenant owner, then sets
 * deleted_at on v2_tenants via service_role. The tenant disappears immediately
 * from all RLS-guarded queries (get_my_tenant_ids, v2_user_tenants_view).
 *
 * Only the owner can call this. Throws on any error.
 */
export async function deleteTenantSoft(tenantId: string): Promise<void> {
    const { error } = await supabase.functions.invoke("delete-tenant", {
        body: { tenantId }
    });

    if (error) {
        if (error instanceof FunctionsHttpError) {
            const status = error.context.status;
            if (status === 401) {
                throw new Error("Autenticazione non valida. Rifai il login e riprova.");
            }
            if (status === 403) {
                throw new Error("Non sei autorizzato ad eliminare questa azienda.");
            }
        }
        throw error;
    }
}

/**
 * Returns all soft-deleted tenants owned by the calling user.
 *
 * Calls the get_my_deleted_tenants() SECURITY DEFINER RPC which bypasses the
 * v2_tenants SELECT policy (that filters out deleted rows) while still
 * restricting results to owner_user_id = auth.uid().
 */
export async function getDeletedTenants(): Promise<DeletedTenant[]> {
    const { data, error } = await supabase.rpc("get_my_deleted_tenants");
    if (error) throw error;
    return (data as DeletedTenant[]) ?? [];
}

/**
 * Restores a soft-deleted tenant by setting deleted_at = NULL.
 *
 * The edge function verifies that the caller is the tenant owner, that the
 * tenant is currently soft-deleted, and that it has not yet been purged.
 * The actual UPDATE uses service_role to satisfy trg_protect_tenant_deleted_at.
 *
 * Only the owner can call this. Throws on any error.
 */
export async function restoreTenant(tenantId: string): Promise<void> {
    const { error } = await supabase.functions.invoke("restore-tenant", {
        body: { tenantId }
    });

    if (error) {
        if (error instanceof FunctionsHttpError) {
            const status = error.context.status;
            if (status === 401) {
                throw new Error("Autenticazione non valida. Rifai il login e riprova.");
            }
            if (status === 403) {
                throw new Error("Non sei autorizzato a ripristinare questa azienda.");
            }
            if (status === 404) {
                throw new Error("Azienda non trovata. Potrebbe essere già stata eliminata definitivamente.");
            }
            if (status === 409) {
                throw new Error("Questa azienda non risulta eliminata.");
            }
        }
        throw error;
    }
}

/**
 * Permanently and immediately deletes a soft-deleted tenant.
 *
 * The edge function verifies ownership and that deleted_at IS NOT NULL, then
 * runs the full deletion sequence (child tables → storage → tenant row).
 * This action is irreversible.
 *
 * Only the owner can call this. Throws on any error.
 */
export async function purgeTenantNow(tenantId: string): Promise<void> {
    const { error } = await supabase.functions.invoke("purge-tenant-now", {
        body: { tenantId }
    });

    if (error) {
        if (error instanceof FunctionsHttpError) {
            const status = error.context.status;
            if (status === 401) {
                throw new Error("Autenticazione non valida. Rifai il login e riprova.");
            }
            if (status === 403) {
                throw new Error("Non sei autorizzato ad eliminare questa azienda.");
            }
            if (status === 404) {
                throw new Error("Azienda non trovata.");
            }
            if (status === 409) {
                throw new Error("L'azienda non è in stato di eliminazione.");
            }
        }
        throw error;
    }
}

/**
 * Sets the calling user's membership status to 'left' for the given tenant.
 *
 * Calls the leave_tenant SECURITY DEFINER RPC which:
 *   - blocks owners from leaving their own tenant
 *   - requires an active membership row to exist
 *
 * Only members (non-owners) can call this successfully. Throws on any error.
 */
export async function leaveTenant(tenantId: string): Promise<void> {
    const { error } = await supabase.rpc("leave_tenant", { p_tenant_id: tenantId });
    if (error) {
        if (error.message.includes("owner_cannot_leave")) {
            throw new Error("Il proprietario non può lasciare la propria azienda.");
        }
        if (error.message.includes("membership_not_found")) {
            throw new Error("Non sei membro attivo di questa azienda.");
        }
        throw error;
    }
}
