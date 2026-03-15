import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";

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
