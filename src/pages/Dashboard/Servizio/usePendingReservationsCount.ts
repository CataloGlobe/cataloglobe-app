import { useCallback, useEffect, useRef, useState } from "react";
import { usePollingRefresh } from "@/hooks/usePollingRefresh";
import { countPendingReservationsByActivity } from "@/services/supabase/reservations";

/**
 * Le prenotazioni da confermare della sede, di qualunque giorno (lo stesso
 * numero della voce Prenotazioni in sidebar), per la riga «Adesso» di In
 * servizio (D). Ogni minuto, al ritorno sulla scheda e quando lo chiede
 * `reload`; un errore lascia il numero di prima. Scrive solo l'ultima
 * richiesta: cambiando sede, una risposta lenta della vecchia non vale.
 */
export function usePendingReservationsCount(
    tenantId: string,
    activityId: string,
    enabled: boolean
): { count: number; reload: () => void } {
    const [count, setCount] = useState(0);
    const lastRequest = useRef(0);
    const reload = useCallback(() => {
        if (!enabled) return;
        const request = ++lastRequest.current;
        countPendingReservationsByActivity(tenantId)
            .then(byActivity => {
                if (request === lastRequest.current) setCount(byActivity[activityId] ?? 0);
            })
            .catch((error: unknown) => console.warn("[usePendingReservationsCount]", error));
    }, [enabled, tenantId, activityId]);
    useEffect(() => {
        const requests = lastRequest;
        setCount(0);
        reload();
        return () => {
            requests.current++;
        };
    }, [reload]);
    usePollingRefresh(reload, { intervalMs: 60_000, enabled });
    return { count: enabled ? count : 0, reload };
}
