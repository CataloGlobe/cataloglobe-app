import { useEffect, useState } from "react";
import type { UserPermissions } from "@/lib/permissions";
import { canDoOnActivity } from "@/lib/permissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { listPendingReservations } from "@/services/supabase/reservations";
import { getOperativeDayBounds, listOrdersForActivity } from "@/services/supabase/orders";
import { listTablesWithState } from "@/services/supabase/tables";
import { countUnavailableProducts } from "@/services/supabase/productAvailability";
import { getReviewMetrics } from "@/services/supabase/analytics";
import { periodToDateRange } from "@/pages/Dashboard/Analytics/utils/periodComparison";
import type { V2Reservation } from "@/types/reservation";

/** Le cose da fare della Home (copia «Visual Redesign PR 3», `homeTodo`):
 *  dati grezzi per sede, le frasi le scrive la pagina. Sola lettura. */
export type HomeTodoSede = {
    id: string;
    name: string;
    /** Prenotazioni in attesa, dalla più vicina. */
    pending: V2Reservation[];
    newOrders: number;
    callingTables: number;
    /** Comande aperte inviate prima dell'inizio della giornata operativa. */
    oldOrders: number;
    unavailable: number;
    lowReviews: number;
};

export type HomeTodoState =
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; sedi: HomeTodoSede[] };

const OPEN_STATUSES = ["submitted", "acknowledged", "ready"] as const;

/** Un pezzo che fallisce vale zero: la Home non si ferma per una sezione
 *  (lo stesso dato resta nella sua pagina). */
async function orZero<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
    try {
        return await promise;
    } catch (error) {
        console.error(`[Home] ${label} failed:`, error);
        return fallback;
    }
}

export function useHomeTodo(
    tenantId: string | null | undefined,
    sedi: { id: string; name: string }[] | null,
    permissions: UserPermissions | null
): HomeTodoState {
    const { hasFeature } = usePlanFeatures();
    const ordering = hasFeature("table_ordering");
    const reservations = hasFeature("table_reservation");
    const [state, setState] = useState<HomeTodoState>({ status: "loading" });
    // Le sedi arrivano come array nuovo a ogni lettura: la chiave è la lista di id.
    const sediKey = sedi?.map(s => `${s.id}:${s.name}`).join("|") ?? null;

    useEffect(() => {
        if (!tenantId || !sedi || !permissions) return;
        let cancelled = false;
        setState({ status: "loading" });

        async function load() {
            const can = (p: string, id: string) => canDoOnActivity(permissions!, p, id);
            const week = periodToDateRange("7d");
            const anyReservations = reservations && sedi!.some(s => can("reservations.read", s.id));
            const anyOrders = ordering && sedi!.some(s => can("orders.read", s.id));

            const [pendingPage, bounds] = await Promise.all([
                anyReservations
                    ? orZero(listPendingReservations(tenantId!), { rows: [], truncated: false }, "pending reservations")
                    : Promise.resolve({ rows: [] as V2Reservation[], truncated: false }),
                anyOrders ? orZero(getOperativeDayBounds(), null, "operative day") : Promise.resolve(null)
            ]);

            const rows = await Promise.all(
                sedi!.map(async (sede): Promise<HomeTodoSede> => {
                    const readsOrders = ordering && can("orders.read", sede.id);
                    const readsTables = ordering && can("tables.read", sede.id);
                    const [orders, tables, unavailable, reviews] = await Promise.all([
                        readsOrders
                            ? orZero(
                                  listOrdersForActivity(tenantId!, sede.id, {
                                      status: [...OPEN_STATUSES],
                                      includeItems: false,
                                      limit: 200
                                  }),
                                  [],
                                  "open orders"
                              )
                            : Promise.resolve([]),
                        readsTables ? orZero(listTablesWithState(tenantId!, sede.id), [], "tables") : Promise.resolve([]),
                        can("products.read", sede.id)
                            ? orZero(countUnavailableProducts(tenantId!, sede.id), 0, "unavailable products")
                            : Promise.resolve(0),
                        can("reviews.read", sede.id)
                            ? orZero(getReviewMetrics(tenantId!, week, sede.id), null, "review metrics")
                            : Promise.resolve(null)
                    ]);
                    const dayStart = bounds ? new Date(bounds.dayStart).getTime() : null;
                    const isOld = (submittedAt: string | null) =>
                        dayStart != null && submittedAt != null && new Date(submittedAt).getTime() < dayStart;
                    return {
                        id: sede.id,
                        name: sede.name,
                        pending: can("reservations.read", sede.id)
                            ? pendingPage.rows.filter(r => r.activity_id === sede.id)
                            : [],
                        // Senza l'inizio della giornata non si separano nuove e rimaste: si contano tutte come nuove.
                        newOrders: orders.filter(o => o.status === "submitted" && !isOld(o.submitted_at)).length,
                        callingTables: tables.filter(t => t.waiter_called_count > 0 || t.bill_requested_count > 0).length,
                        oldOrders: orders.filter(o => isOld(o.submitted_at)).length,
                        unavailable,
                        lowReviews: (reviews?.distribution ?? [])
                            .filter(d => d.stars <= 3)
                            .reduce((sum, d) => sum + d.count, 0)
                    };
                })
            );
            if (!cancelled) setState({ status: "ready", sedi: rows });
        }

        load().catch(error => {
            console.error("[Home] to-do failed:", error);
            if (!cancelled) setState({ status: "error" });
        });
        return () => {
            cancelled = true;
        };
        // `sedi` entra tramite `sediKey`: stessa lista, nessuna nuova lettura.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId, sediKey, permissions, ordering, reservations]);

    return state;
}
