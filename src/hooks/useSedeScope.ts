// ============================================================
// useSedeScope() — primitiva di stato "sede attiva" condivisa.
//
// Consuma `useTenantId()` + `usePermissions()` e fetcha le
// `activities` del tenant via service layer. Espone il valore
// corrente (SedeScopeValue) e il setter. Persistenza in
// sessionStorage namespaced per tenant, sync intra-tab via
// subscriber module-level (vedi `sedeScopeStore.ts`).
//
// NON crea provider. NESSUN context. Più istanze nella stessa
// tab restano sincronizzate via useSyncExternalStore.
// ============================================================

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTenantId } from "@/context/useTenantId";
import { usePermissions } from "@/context/PermissionsContext";
import { isOwnerOrAdmin } from "@/lib/permissions";
import { getActivities } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";
import {
    readSedeScope,
    resolveSedeScope,
    subscribeSedeScope,
    writeSedeScope,
    type SedeScopeValue
} from "./sedeScopeStore";

export type { SedeScopeValue } from "./sedeScopeStore";
export {
    SCOPE_ALL,
    SEDE_SCOPED_ROUTES,
    type SedeScopedRoute
} from "./sedeScopeStore";

export interface UseSedeScopeResult {
    /** Valore corrente: `SCOPE_ALL` oppure un `activityId` leggibile. */
    value: SedeScopeValue;
    /** Setter. Persiste in sessionStorage e notifica gli altri subscriber. */
    setValue: (next: SedeScopeValue) => void;
    /** Sedi che l'utente può vedere (owner/admin = tutte, scoped = solo le sue). */
    readableActivities: V2Activity[];
    /** True se 1 sola sede leggibile (la UI deve nascondere il selettore). */
    isForcedSingleSite: boolean;
}

export function useSedeScope(): UseSedeScopeResult {
    const tenantId = useTenantId();
    const { permissions } = usePermissions();

    const [activities, setActivities] = useState<V2Activity[]>([]);

    // Fetch activities per tenant. Reset on tenant switch.
    useEffect(() => {
        if (!tenantId) {
            setActivities([]);
            return;
        }
        let cancelled = false;
        getActivities(tenantId)
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

    // External store subscription — re-render quando QUALSIASI tenant
    // cambia il proprio sedeScope. Filtraggio per tenant via getSnapshot.
    const subscribe = useCallback(
        (cb: () => void) => subscribeSedeScope(cb),
        []
    );
    const getSnapshot = useCallback<() => SedeScopeValue | null>(
        () => (tenantId ? readSedeScope(tenantId) : null),
        [tenantId]
    );
    const getServerSnapshot = useCallback<() => SedeScopeValue | null>(
        () => null,
        []
    );
    const storedValue = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const { value, isForcedSingleSite } = useMemo(
        () => resolveSedeScope({ storedValue, readableActivityIds }),
        [storedValue, readableActivityIds]
    );

    const setValue = useCallback(
        (next: SedeScopeValue) => {
            if (!tenantId) return;
            writeSedeScope(tenantId, next);
        },
        [tenantId]
    );

    return { value, setValue, readableActivities, isForcedSingleSite };
}
