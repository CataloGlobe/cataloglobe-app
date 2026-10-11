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

    const permissions = new Set(row.permissions ?? []);
    const activitiesByPermission =
        row.role === "owner" || row.role === "admin" ? undefined : await fetchActivitiesByPermission(tenantId);
    // Un permesso dato da un ruolo di sede più basso (viewer qui, manager là)
    // vale anche a livello di tenant, come in `has_permission`.
    activitiesByPermission?.forEach((_, permissionId) => permissions.add(permissionId));

    return {
        tenantId,
        role: row.role,
        activityIds: row.activity_ids ?? [],
        permissions,
        activitiesByPermission
    };
}

/**
 * Le sedi per permesso dei ruoli di sede (RPC `get_my_permission_activities`,
 * D35). Se la RPC non c'è ancora (migration non applicata) o fallisce, niente
 * mappa: si resta ai permessi del ruolo più alto, come prima.
 */
async function fetchActivitiesByPermission(tenantId: string): Promise<Map<string, string[]> | undefined> {
    const { data, error } = await supabase.rpc("get_my_permission_activities", { p_tenant_id: tenantId });
    if (error || !Array.isArray(data)) return undefined;
    const map = new Map<string, string[]>();
    for (const row of data) {
        map.set(row.permission_id, row.activity_ids ?? []);
    }
    return map;
}

function isUserRole(value: string): value is UserRole {
    return value === "owner" || value === "admin" || value === "manager" || value === "staff" || value === "viewer";
}

/**
 * Id dei tenant con cui il caller ha una relazione reale (owner via
 * `tenants.owner_user_id`, oppure membership attiva in `tenant_memberships`,
 * qualunque ruolo). Wrapper sopra RPC `public.get_my_tenant_ids()`.
 *
 * Usato dalla pagina pubblica per decidere se mostrare gli elementi
 * riservati (barra "Barra non visibile ai clienti", `?simulate=`, `?preview=`):
 * la domanda è "appartiene a QUESTO tenant?", non "ha un permesso X" —
 * per questo non passa da `get_my_permissions` (che richiede un tenant e
 * lancia 42501 sui non membri).
 *
 * Ritorna `[]` per un utente senza alcun tenant; throws su errori RPC.
 */
export async function fetchMyTenantIds(): Promise<string[]> {
    const { data, error } = await supabase.rpc("get_my_tenant_ids");
    if (error) throw error;
    return Array.isArray(data) ? data.filter((id): id is string => typeof id === "string") : [];
}
