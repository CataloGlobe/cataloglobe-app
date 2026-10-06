/**
 * Controlli di accesso condivisi dalle edge function admin.
 *
 * Tutti e due si chiamano con la user-client (JWT valido → auth.uid()
 * popolato, richiesto dalle RPC). Le RPC finali delle edge girano in
 * service_role (RLS bypassata): questi sono gli unici layer che verificano
 * chi agisce.
 *
 * - `isMemberOfTenant`: l'utente appartiene al tenant (get_my_tenant_ids).
 * - `hasActivityPermission`: l'utente ha il permesso SULLA sede
 *   (has_permission). Fail-closed: qualunque errore RPC → false, mai
 *   concedere in dubbio.
 *
 * Nato da FIX-3 / CG-04: le copie locali in submit-order-admin, close-table,
 * toggle-product-availability e generate-table-qrs restano finché quelle
 * funzioni non passano di qui (CG-11).
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function isMemberOfTenant(
    supabaseUser: SupabaseClient,
    tenantId: string
): Promise<{ kind: "ok"; member: boolean } | { kind: "db_error"; message: string }> {
    const { data, error } = await supabaseUser.rpc("get_my_tenant_ids");
    if (error) {
        return { kind: "db_error", message: error.message };
    }
    // RPC returns SETOF uuid → supabase-js delivers an array of { get_my_tenant_ids: uuid }
    // or an array of strings depending on the version. Normalize both shapes.
    const ids: string[] = [];
    if (Array.isArray(data)) {
        for (const row of data) {
            if (typeof row === "string") ids.push(row);
            else if (row && typeof row === "object" && "get_my_tenant_ids" in row) {
                const v = (row as { get_my_tenant_ids: unknown }).get_my_tenant_ids;
                if (typeof v === "string") ids.push(v);
            }
        }
    }
    return { kind: "ok", member: ids.includes(tenantId) };
}

export async function hasActivityPermission(
    supabaseUser: SupabaseClient,
    permissionId: string,
    activityId: string,
    logTag: string
): Promise<boolean> {
    const { data, error } = await supabaseUser.rpc("has_permission", {
        p_permission_id: permissionId,
        p_activity_id: activityId
    });
    if (error) {
        console.error(`[${logTag}] has_permission read error:`, error.message);
        return false;
    }
    return data === true;
}
