// ============================================================
// Activities cache — module-level per-tenant, deduplica fetch.
//
// Lo stesso tenant può montare contemporaneamente navbar + N pagine
// che consumano `useSedeScope`: senza cache, ogni mount istanza una
// call a `getActivities`. Qui: una sola call per tenant; le
// successive leggono dal Map. Le mutation runtime (creazione/
// eliminazione sede) richiedono invalidate manuale via
// `invalidateActivitiesCache(tenantId)`.
//
// File separato da `sedeScopeStore.ts` perché importa il service
// Supabase, che usa alias `@services` non risolto da vitest (env
// node, alias minimo). Tenere `sedeScopeStore.ts` pulito mantiene
// la testabilità unitaria in node.
// ============================================================

import { getActivities } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";

const cache = new Map<string, V2Activity[]>();
const inflight = new Map<string, Promise<V2Activity[]>>();

/** Ritorna le activities del tenant, riusando la cache module-level.
 *  Dedup fetch concorrenti via inflight Map. */
export async function getActivitiesCached(tenantId: string): Promise<V2Activity[]> {
    const cached = cache.get(tenantId);
    if (cached) return cached;

    const pending = inflight.get(tenantId);
    if (pending) return pending;

    const promise = getActivities(tenantId)
        .then(rows => {
            cache.set(tenantId, rows);
            inflight.delete(tenantId);
            return rows;
        })
        .catch(err => {
            inflight.delete(tenantId);
            throw err;
        });

    inflight.set(tenantId, promise);
    return promise;
}

/** Snapshot sincrono della cache (null se non popolata). Per consumer
 *  che vogliono evitare il loading flash sui mount successivi. */
export function readActivitiesCache(tenantId: string): V2Activity[] | null {
    return cache.get(tenantId) ?? null;
}

/** Invalida la cache: chiamare dopo mutation di activities
 *  (create/delete/update). Senza argomento azzera tutto. */
export function invalidateActivitiesCache(tenantId?: string): void {
    if (tenantId) {
        cache.delete(tenantId);
        inflight.delete(tenantId);
    } else {
        cache.clear();
        inflight.clear();
    }
}
