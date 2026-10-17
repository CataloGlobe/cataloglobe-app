import { useCallback, useEffect, useRef, useState } from "react";
import { usePollingRefresh } from "@/hooks/usePollingRefresh";
import { listReservations } from "@/services/supabase/reservations";
import { todayIsoDate } from "@/utils/dateLocal";
import type { V2Reservation } from "@/types/reservation";

export type NextArrival = Pick<V2Reservation, "reservation_time" | "customer_name" | "party_size">;

/**
 * Il prossimo arrivo di oggi nella sede (prenotazione confermata con l'ora
 * non ancora passata), per la riga «Adesso» calma di In servizio (D, copia
 * «Visual Redesign PR 3»). Sola lettura, ogni minuto e al ritorno sulla
 * scheda; un errore lascia il valore di prima. Scrive solo l'ultima
 * richiesta, come `usePendingReservationsCount`.
 */
export function useNextArrival(tenantId: string, activityId: string, enabled: boolean): NextArrival | null {
    const [next, setNext] = useState<NextArrival | null>(null);
    const lastRequest = useRef(0);
    const reload = useCallback(() => {
        if (!enabled) return;
        const request = ++lastRequest.current;
        const today = todayIsoDate();
        listReservations(tenantId, { from: today, to: today }, activityId)
            .then(rows => {
                if (request !== lastRequest.current) return;
                const now = new Date();
                const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
                setNext(rows.find(r => r.status === "confirmed" && r.reservation_time.slice(0, 5) >= hhmm) ?? null);
            })
            .catch((error: unknown) => console.warn("[useNextArrival]", error));
    }, [enabled, tenantId, activityId]);
    useEffect(() => {
        const requests = lastRequest;
        setNext(null);
        reload();
        return () => {
            requests.current++;
        };
    }, [reload]);
    usePollingRefresh(reload, { intervalMs: 60_000, enabled });
    return enabled ? next : null;
}
