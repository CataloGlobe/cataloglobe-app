import { supabase } from "@/services/supabase/client";
import type { UserPermissions, UserRole } from "@/lib/permissions";

/**
 * Fetch del set permessi del caller per il tenant indicato.
 *
 * Wrapper sopra RPC `public.get_my_permissions(p_tenant_id)`.
 *
 * Throws su:
 *  - 42501 (caller non appartiene al tenant)
 *  - 44000 (tenant inesistente — gestito come 42501 lato RPC)
 *  - errori network / Supabase generic
 *
 * La forma di ritorno della RPC è `TABLE(role, activity_ids, permissions)` →
 * Supabase la materializza come array; prendiamo il primo elemento (sempre
 * 1 riga su success).
 */
export async function fetchMyPermissions(tenantId: string): Promise<UserPermissions> {
    const { data, error } = await supabase.rpc("get_my_permissions", { p_tenant_id: tenantId });

    if (error) {
        throw error;
    }

    if (!Array.isArray(data) || data.length === 0) {
        throw new Error("get_my_permissions: empty response");
    }

    const row = data[0] as {
        role: string;
        activity_ids: string[] | null;
        permissions: string[] | null;
    };

    if (!isUserRole(row.role)) {
        throw new Error(`get_my_permissions: invalid role "${row.role}"`);
    }

    return {
        tenantId,
        role: row.role,
        activityIds: row.activity_ids ?? [],
        permissions: new Set(row.permissions ?? [])
    };
}

function isUserRole(value: string): value is UserRole {
    return value === "owner" || value === "admin" || value === "manager" || value === "staff" || value === "viewer";
}
