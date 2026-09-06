// Verifica di appartenenza al tenant per Edge Function che ricevono un JWT
// utente Supabase (NON il JWT customer custom dell'epic ordering).
//
// Riusa l'helper SECURITY DEFINER `public.get_my_tenant_ids()` (owner via
// `tenants.owner_user_id` + membership attiva in `tenant_memberships`, ogni
// ruolo: admin tenant-wide e manager/staff/viewer activity-scoped) invece di
// riscrivere la logica di appartenenza. Nessun permesso specifico richiesto:
// la domanda è "questo utente ha una relazione reale con questo tenant?".
//
// Il client va costruito dal chiamante con la anon key + header
// `Authorization: Bearer <jwt>` (pattern di toggle-product-availability /
// cancel-order-item), così la RPC gira con l'identità dell'utente. Questo
// modulo resta privo di import Deno/esm.sh per essere testabile con vitest.
//
// Fail-closed: qualunque errore (JWT invalido/scaduto, errore DB, eccezione
// di rete) vale "non membro".

/** JWT utente dall'header Authorization (case-insensitive su "Bearer "), o null. */
export function extractBearerJwt(req: { headers: { get(name: string): string | null } }): string | null {
    const h = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!h || !h.toLowerCase().startsWith("bearer ")) return null;
    const jwt = h.slice(7).trim();
    return jwt.length > 0 ? jwt : null;
}

export type TenantIdsRpcClient = {
    rpc(fn: "get_my_tenant_ids"): Promise<{ data: unknown; error: unknown }>;
};

/** Normalizza le due forme in cui PostgREST può serializzare un SETOF uuid. */
export function parseTenantIds(data: unknown): string[] {
    if (!Array.isArray(data)) return [];
    const ids: string[] = [];
    for (const row of data) {
        if (typeof row === "string") {
            ids.push(row);
        } else if (row && typeof row === "object" && "get_my_tenant_ids" in row) {
            const v = (row as { get_my_tenant_ids: unknown }).get_my_tenant_ids;
            if (typeof v === "string") ids.push(v);
        }
    }
    return ids;
}

export async function isTenantMember(userClient: TenantIdsRpcClient, tenantId: string): Promise<boolean> {
    try {
        const { data, error } = await userClient.rpc("get_my_tenant_ids");
        if (error) return false;
        return parseTenantIds(data).includes(tenantId);
    } catch {
        return false;
    }
}
