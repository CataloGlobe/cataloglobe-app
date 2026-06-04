// ============================================================
// useSedeScope() — primitiva di stato "sede attiva" condivisa.
//
// Consuma `useTenantId()` + `usePermissions()` e fetcha le
// `activities` del tenant via service layer. Espone il valore
// corrente (SedeScopeValue) e il setter.
//
// Modalità (route-driven via opts.routeKey):
//   - default: persistenza sessionStorage per-tenant, "Tutte le sedi"
//     (SCOPE_ALL) ammesso come valore.
//   - single-site (routeKey ∈ SEDE_SINGLE_SITE_ROUTES): persistenza
//     localStorage cross-session (key globale, NON tenant-scoped),
//     SCOPE_ALL NON ammesso (resolver dedicato ritorna sempre un
//     activityId — eccetto 0-sedi placeholder).
//
// Sync intra-tab via subscriber module-level UNICO (`subscribeSedeScope`)
// — i consumer single-site e default condividono lo stesso pub/sub.
//
// NON crea provider. NESSUN context. Più istanze nella stessa tab
// restano sincronizzate via useSyncExternalStore.
// ============================================================

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTenantId } from "@/context/useTenantId";
import { usePermissions } from "@/context/PermissionsContext";
import { isOwnerOrAdmin } from "@/lib/permissions";
import type { V2Activity } from "@/types/activity";
import {
    SEDE_SINGLE_SITE_ROUTES,
    type BusinessRouteKey
} from "@/components/layout/AppHeader/navbarBreadcrumbRoutes";
import { getActivitiesCached, readActivitiesCache } from "./activitiesCache";
import {
    SCOPE_ALL,
    readSedeScope,
    readSedeScopeLocal,
    resolveSedeScope,
    resolveSedeScopeSingle,
    subscribeSedeScope,
    writeSedeScope,
    writeSedeScopeLocal,
    type SedeScopeValue
} from "./sedeScopeStore";

export type { SedeScopeValue } from "./sedeScopeStore";
export {
    SCOPE_ALL,
    SEDE_SCOPED_ROUTES,
    type SedeScopedRoute
} from "./sedeScopeStore";

export interface UseSedeScopeOpts {
    /** Route corrente. Se ∈ `SEDE_SINGLE_SITE_ROUTES` attiva modalità
     *  single-site (storage localStorage, niente SCOPE_ALL). */
    routeKey?: BusinessRouteKey;
}

export interface UseSedeScopeResult {
    /** Valore corrente: `SCOPE_ALL` oppure un `activityId` leggibile. */
    value: SedeScopeValue;
    /** Setter. Persiste nello storage di modalità e notifica i subscriber. */
    setValue: (next: SedeScopeValue) => void;
    /** Sedi che l'utente può vedere (owner/admin = tutte, scoped = solo le sue). */
    readableActivities: V2Activity[];
    /** True se 1 sola sede leggibile (la UI deve nascondere il selettore). */
    isForcedSingleSite: boolean;
}

export function useSedeScope(opts?: UseSedeScopeOpts): UseSedeScopeResult {
    const tenantId = useTenantId();
    const { permissions } = usePermissions();

    const routeKey = opts?.routeKey;
    const isSingle = routeKey ? SEDE_SINGLE_SITE_ROUTES.has(routeKey) : false;

    // Sincrono: se la cache module-level ha già i dati, parti popolato
    // (no loading flash sui mount successivi nella stessa tab).
    const [activities, setActivities] = useState<V2Activity[]>(() =>
        tenantId ? (readActivitiesCache(tenantId) ?? []) : []
    );

    // Fetch activities per tenant via cache. Una sola call per tenant
    // (deduplicata anche se più hook mount in parallelo). Reset on switch.
    useEffect(() => {
        if (!tenantId) {
            setActivities([]);
            return;
        }
        const cached = readActivitiesCache(tenantId);
        if (cached) {
            setActivities(cached);
            return;
        }
        let cancelled = false;
        getActivitiesCached(tenantId)
            .then(rows => {
                if (cancelled) return;
                setActivities(rows);
            })
            .catch(() => {
                if (cancelled) return;
                setActivities([]);
            });
        return () => {
            cancelled = true;
        };
    }, [tenantId]);

    const readableActivities = useMemo<V2Activity[]>(() => {
        if (!permissions) return [];
        if (isOwnerOrAdmin(permissions)) return activities;
        const allowed = new Set(permissions.activityIds);
        return activities.filter(a => allowed.has(a.id));
    }, [activities, permissions]);

    const readableActivityIds = useMemo(
        () => readableActivities.map(a => a.id),
        [readableActivities]
    );

    // External store subscription — riusa lo STESSO pub/sub per entrambe
    // le modalità. Branch sul getSnapshot in base alla modalità.
    const subscribe = useCallback(
        (cb: () => void) => subscribeSedeScope(cb),
        []
    );
    const getSnapshot = useCallback<() => SedeScopeValue | null>(
        () => {
            if (isSingle) return readSedeScopeLocal();
            return tenantId ? readSedeScope(tenantId) : null;
        },
        [tenantId, isSingle]
    );
    const getServerSnapshot = useCallback<() => SedeScopeValue | null>(
        () => null,
        []
    );
    const storedValue = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const { value, isForcedSingleSite } = useMemo(() => {
        const params = { storedValue, readableActivityIds };
        return isSingle ? resolveSedeScopeSingle(params) : resolveSedeScope(params);
    }, [storedValue, readableActivityIds, isSingle]);

    const setValue = useCallback(
        (next: SedeScopeValue) => {
            if (isSingle) {
                // Single-site: ignora un eventuale tentativo di scrivere
                // SCOPE_ALL (non valido in questa modalità).
                if (next !== SCOPE_ALL) {
                    writeSedeScopeLocal(next);
                }
                return;
            }
            if (!tenantId) return;
            writeSedeScope(tenantId, next);
        },
        [tenantId, isSingle]
    );

    return { value, setValue, readableActivities, isForcedSingleSite };
}
