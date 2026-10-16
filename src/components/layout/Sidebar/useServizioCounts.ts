import { useCallback, useEffect, useRef, useState } from "react";
import { usePermissions } from "@/context/usePermissions";
import { usePollingRefresh } from "@/hooks/usePollingRefresh";
import { canDoOnActivity } from "@/lib/permissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { countSubmittedOrders } from "@/services/supabase/orders";
import { countPendingReservationsByActivity } from "@/services/supabase/reservations";
import { listTablesWithState } from "@/services/supabase/tables";

/** Ogni mezzo minuto, e subito al ritorno sulla scheda. */
const REFRESH_MS = 30_000;
/** Fuoco e visibilità arrivano insieme: un giro solo. */
const MIN_GAP_MS = 5_000;

export interface ServizioCounts {
    /** Comande nuove più tavoli che chiamano (cameriere o conto). */
    servizioCount: number;
    /** Prenotazioni da confermare. */
    pendingReservations: number;
}

const ZERO: ServizioCounts = { servizioCount: 0, pendingReservations: 0 };

type Parts = ServizioCounts & { orders: number; tables: number };
const ZERO_PARTS: Parts = { ...ZERO, orders: 0, tables: 0 };

/**
 * I numeri del Servizio nella sidebar (D, copia «Visual Redesign PR 3»): nella
 * sede dove porta la sezione. Ognuno si chiede solo a chi può leggerlo e col
 * piano che lo prevede; un errore lascia il numero di prima (zero alla prima
 * richiesta). Spento: nessuna richiesta.
 */
export function useServizioCounts(
    tenantId: string | null | undefined,
    activityId: string | null,
    enabled: boolean
): ServizioCounts {
    const { permissions } = usePermissions();
    const { hasFeature } = usePlanFeatures();
    // Le due parti di In servizio restano separate: un errore su una tiene il
    // valore di prima di quella sola.
    const [counts, setCounts] = useState<Parts>(ZERO_PARTS);
    // Solo l'ultima richiesta scrive: cambiando sede, una risposta lenta della
    // vecchia non sovrascrive i numeri della nuova.
    const lastRequest = useRef(0);
    const lastStart = useRef(0);

    const can = (permission: string) => !!permissions && !!activityId && canDoOnActivity(permissions, permission, activityId);
    const readOrders = enabled && hasFeature("table_ordering") && can("orders.read");
    const readTables = enabled && hasFeature("table_ordering") && can("seatings.read");
    const readReservations = enabled && hasFeature("table_reservation") && can("reservations.read");
    const active = !!tenantId && !!activityId && (readOrders || readTables || readReservations);

    const load = useCallback(
        (force = false) => {
            if (!tenantId || !activityId || !active) return;
            const now = Date.now();
            if (!force && now - lastStart.current < MIN_GAP_MS) return;
            lastStart.current = now;
            const request = ++lastRequest.current;
            const keepOnError = (part: string, p: Promise<number>) =>
                p.catch((error: unknown) => {
                    console.warn(`[useServizioCounts] ${part}`, error);
                    return undefined;
                });
            void Promise.all([
                readOrders ? keepOnError("comande", countSubmittedOrders(tenantId, activityId)) : 0,
                readTables
                    ? keepOnError(
                        "tavoli",
                        listTablesWithState(tenantId, activityId).then(
                            tables => tables.filter(t => t.waiter_called_count > 0 || t.bill_requested_count > 0).length
                        )
                    )
                    : 0,
                readReservations
                    ? keepOnError(
                        "prenotazioni",
                        countPendingReservationsByActivity(tenantId).then(byActivity => byActivity[activityId] ?? 0)
                    )
                    : 0
            ]).then(([orders, tables, reservations]) => {
                if (request !== lastRequest.current) return;
                setCounts(prev => ({
                    servizioCount: (orders ?? prev.orders) + (tables ?? prev.tables),
                    pendingReservations: reservations ?? prev.pendingReservations,
                    orders: orders ?? prev.orders,
                    tables: tables ?? prev.tables
                }));
            });
        },
        [tenantId, activityId, active, readOrders, readTables, readReservations]
    );

    useEffect(() => {
        const requests = lastRequest;
        setCounts(ZERO_PARTS);
        load(true);
        return () => {
            requests.current++;
        };
    }, [load]);
    const poll = useCallback(() => load(), [load]);
    usePollingRefresh(poll, { intervalMs: REFRESH_MS, enabled: active });

    return active ? { servizioCount: counts.servizioCount, pendingReservations: counts.pendingReservations } : ZERO;
}
