import { useEffect, useState } from "react";
import { useTenantId } from "@/context/useTenantId";
import type { V2Activity } from "@/types/activity";
import { getActivitiesCached, readActivitiesCache, subscribeActivitiesCache } from "./activitiesCache";

export interface ActivitySummary {
    id: string;
    name: string;
    status: V2Activity["status"];
    inactiveReason: V2Activity["inactive_reason"];
}

/**
 * Nome e stato di una sede, per chi deve solo **dire dove sei**: il
 * selettore di sede nell'header (§51.7), montato su ogni pagina.
 *
 * Passa dalla cache per tenant che già alimenta lo scope (`activitiesCache`):
 * una lettura sola per azienda, condivisa, e lo snapshot sincrono evita il
 * lampo di vuoto quando si cambia pagina dentro la stessa sede. Chi ha
 * bisogno della sede intera continua a leggerla dalla sua pagina — questo
 * hook non la sostituisce.
 */
export function useActivitySummary(activityId: string | undefined): ActivitySummary | null {
    const tenantId = useTenantId();
    const [summary, setSummary] = useState<ActivitySummary | null>(() => pick(tenantId, activityId));

    useEffect(() => {
        if (!tenantId || !activityId) {
            setSummary(null);
            return;
        }
        const cached = pick(tenantId, activityId);
        if (cached) {
            setSummary(cached);
            return;
        }
        let cancelled = false;
        getActivitiesCached(tenantId)
            .then(() => {
                if (!cancelled) setSummary(pick(tenantId, activityId));
            })
            .catch(() => {
                // Silente: senza nome l'intestazione mostra solo l'uscita dal
                // contesto, che è l'informazione che non può mancare.
                if (!cancelled) setSummary(null);
            });
        return () => {
            cancelled = true;
        };
    }, [tenantId, activityId]);

    // Nome o stato cambiati altrove (Scheda, Pubblicazione): si rilegge.
    useEffect(() => {
        if (!tenantId || !activityId) return;
        return subscribeActivitiesCache(changed => {
            if (changed === tenantId) setSummary(pick(tenantId, activityId));
        });
    }, [tenantId, activityId]);

    return summary;
}

function pick(tenantId: string | null | undefined, activityId: string | undefined): ActivitySummary | null {
    if (!tenantId || !activityId) return null;
    const row = readActivitiesCache(tenantId)?.find(a => a.id === activityId);
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        status: row.status,
        inactiveReason: row.inactive_reason ?? null
    };
}
