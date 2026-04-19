import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";

/**
 * Uploads a logo file to the tenant-assets bucket.
 * Returns the storage path (not the full public URL).
 */
export async function uploadTenantLogo(tenantId: string, file: File): Promise<string> {
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) throw new Error("Formato non supportato. Usa PNG, JPG o WEBP.");
    if (file.size > 5 * 1024 * 1024) throw new Error("File troppo grande. Max 5MB.");

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const filePath = `${tenantId}/logo.${ext}`;

    const { error } = await supabase.storage
        .from("tenant-assets")
        .upload(filePath, file, { upsert: true, contentType: file.type });
    if (error) throw error;

    return filePath;
}

/**
 * Updates (or removes) the tenant logo_url via the SECURITY DEFINER RPC.
 * Pass null to remove the logo.
 */
export async function updateTenantLogoUrl(tenantId: string, logoPath: string | null): Promise<void> {
    const { error } = await supabase.rpc("update_tenant_logo", {
        p_tenant_id: tenantId,
        p_logo_url: logoPath
    });
    if (error) throw error;
}

/**
 * Returns the public URL for a tenant logo path.
 */
export function getTenantLogoPublicUrl(path: string): string {
    return supabase.storage.from("tenant-assets").getPublicUrl(path).data.publicUrl;
}

/**
 * Fetches public tenant info (name + logo_url) via the anon-accessible RPC.
 * Used on the public collection page.
 */
export async function getTenantPublicInfo(tenantId: string): Promise<{ logo_url: string | null; name: string } | null> {
    const { data, error } = await supabase.rpc("get_tenant_public_info", { p_tenant_id: tenantId });
    if (error || !data) return null;
    return data as { logo_url: string | null; name: string };
}

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
 * deleted_at on tenants via service_role. The tenant disappears immediately
 * from all RLS-guarded queries (get_my_tenant_ids, user_tenants_view).
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
                throw new Error("Non sei autorizzato ad eliminare questa attività.");
            }
        }
        throw error;
    }
}

/**
 * Returns all soft-deleted tenants owned by the calling user.
 *
 * Calls the get_my_deleted_tenants() SECURITY DEFINER RPC which bypasses the
 * tenants SELECT policy (that filters out deleted rows) while still
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
                throw new Error("Non sei autorizzato a ripristinare questa attività.");
            }
            if (status === 404) {
                throw new Error("Attività non trovata. Potrebbe essere già stata eliminata definitivamente.");
            }
            if (status === 409) {
                throw new Error("Questa attività non risulta eliminata.");
            }
            if (status === 410) {
                throw new Error("Il periodo di ripristino di 30 giorni è scaduto. L'attività non può più essere ripristinata.");
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
                throw new Error("Non sei autorizzato ad eliminare questa attività.");
            }
            if (status === 404) {
                throw new Error("Attività non trovata.");
            }
            if (status === 409) {
                throw new Error("L'attività non è in stato di eliminazione.");
            }
        }
        throw error;
    }
}

/**
 * Updates the name of a tenant. Only fields explicitly passed are updated.
 */
export async function updateTenantName(tenantId: string, name: string): Promise<void> {
    const { error } = await supabase
        .from("tenants")
        .update({ name })
        .eq("id", tenantId);
    if (error) throw error;
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
            throw new Error("Il proprietario non può lasciare la propria attività.");
        }
        if (error.message.includes("membership_not_found")) {
            throw new Error("Non sei membro attivo di questa attività.");
        }
        throw error;
    }
}
