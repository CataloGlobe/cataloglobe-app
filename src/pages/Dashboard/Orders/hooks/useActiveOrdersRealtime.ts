/**
 * useActiveOrdersRealtime — live state for the admin kanban "Comande".
 *
 * Owns the list of orders currently in an active status (submitted /
 * acknowledged / ready) for a given (tenantId, activityId). Backed by:
 *
 *   1. Initial REST fetch via `listOrdersForActivity` with status =
 *      ["submitted", "acknowledged", "ready"], items included.
 *   2. Supabase Realtime postgres_changes subscription on `public.orders`,
 *      filtered server-side by `activity_id = eq.<activityId>` AND by the
 *      caller's RLS policy "Roles can read orders"
 *      (has_permission('orders.read', activity_id)). The server never
 *      emits events for rows the caller cannot SELECT — this is what
 *      keeps the subscription tenant-safe.
 *
 * Event handling:
 *   INSERT — new active order: trigger a silent full refetch (gives us
 *            items[], which postgres_changes does not deliver).
 *   UPDATE — patch in place by id; version-max gate skips echoes and
 *            stale events. If the new status is no longer active, drop
 *            the row from the board (it has moved to "Storico"); we then
 *            notify `onOrderLeftBoard` so the parent can refresh KPI bars.
 *   DELETE — drop by id (safety; cancellations are status updates, not
 *            row deletions).
 *
 * Reconnect resilience: on (re)subscribe we trigger a silent refetch to
 * cover any events lost during a disconnect window (flaky dining-room
 * wifi). Resubscribes also happen when activityId changes.
 *
 * Local patch API: callers that just transitioned an order via Edge
 * Function can apply the response row immediately via `applyLocalPatch`.
 * The realtime echo that follows is then deduplicated by the same
 * version-max gate.
 *
 * Tenant safety: the subscription runs on the singleton (user JWT)
 * supabase client — never service_role. The activity_id server filter
 * narrows event volume; the RLS SELECT enforces the security boundary.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/services/supabase/client";
import { listOrdersForActivity } from "@/services/supabase/orders";
import type { OrderStatus, V2Order, V2OrderWithItems } from "@/types/orders";

const ACTIVE_STATUSES: OrderStatus[] = ["submitted", "acknowledged", "ready"];

function isActiveStatus(status: OrderStatus): boolean {
    return (
        status === "submitted" || status === "acknowledged" || status === "ready"
    );
}

/**
 * Shape applied to the local state after a successful admin transition.
 * Mirrors the fields the Edge Function returns (subset of V2Order). We
 * preserve everything else (items, customer_name_snapshot, ...) from the
 * pre-existing local row.
 */
export interface OrderLocalPatch {
    id: string;
    status: OrderStatus;
    version: number;
    acknowledged_at?: string | null;
    ready_at?: string | null;
    delivered_at?: string | null;
    cancelled_at?: string | null;
    cancelled_by?: V2Order["cancelled_by"];
    cancellation_reason?: string | null;
}

export interface UseActiveOrdersRealtimeOptions {
    /**
     * Fired right after an order leaves the board (status → delivered or
     * cancelled). Used by the page to keep KPI counters in sync without
     * needing a full screen refresh.
     */
    onOrderLeftBoard?: (order: V2OrderWithItems) => void;
    /**
     * Fired SOLO su INSERT realtime genuino di un nuovo ordine submitted
     * (non rectification). NON viene chiamato sul fetch iniziale, sul
     * reconnect refetch, sulle transizioni UPDATE o sulle azioni proprie.
     * Dedup per id all'interno dell'hook evita doppio fire sullo stesso
     * evento. Usato dalla pagina per alert sonoro + title pulse.
     */
    onNewOrder?: (order: V2Order) => void;
}

export interface UseActiveOrdersRealtimeResult {
    orders: V2OrderWithItems[];
    isLoading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    /**
     * Apply a transition response to local state without waiting for the
     * realtime echo. Safe: the matching echo is later discarded by the
     * version-max gate inside the UPDATE handler.
     */
    applyLocalPatch: (patch: OrderLocalPatch) => void;
}

export function useActiveOrdersRealtime(
    tenantId: string | null,
    activityId: string | null,
    options?: UseActiveOrdersRealtimeOptions
): UseActiveOrdersRealtimeResult {
    const [orders, setOrders] = useState<V2OrderWithItems[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Latest orders + onOrderLeftBoard captured via refs so the realtime
    // subscription can read fresh values without resubscribing on every
    // render. The subscription itself only resubscribes on (tenant,
    // activity) change.
    const ordersRef = useRef<V2OrderWithItems[]>([]);
    ordersRef.current = orders;

    const onOrderLeftBoardRef = useRef(options?.onOrderLeftBoard);
    onOrderLeftBoardRef.current = options?.onOrderLeftBoard;

    const onNewOrderRef = useRef(options?.onNewOrder);
    onNewOrderRef.current = options?.onNewOrder;

    // Dedup INSERT realtime per id. Bounded ~100 entries FIFO per evitare
    // crescita illimitata in lunghe sessioni. Reset al resubscribe (cambio
    // tenantId/activityId) — quel reset avviene nel cleanup del useEffect
    // realtime sotto.
    const seenInsertsRef = useRef<Set<string>>(new Set());

    const fetchActive = useCallback(async (): Promise<void> => {
        if (!tenantId || !activityId) {
            setOrders([]);
            setIsLoading(false);
            return;
        }
        setError(null);
        try {
            const data = await listOrdersForActivity(tenantId, activityId, {
                status: ACTIVE_STATUSES,
                includeItems: true,
                limit: 200
            });
            setOrders(data);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Errore caricamento ordini"
            );
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, activityId]);

    const refetch = useCallback(async (): Promise<void> => {
        await fetchActive();
    }, [fetchActive]);

    const applyLocalPatch = useCallback((patch: OrderLocalPatch) => {
        setOrders(prev => {
            const idx = prev.findIndex(o => o.id === patch.id);
            if (idx === -1) return prev;
            const current = prev[idx];
            // Version-max gate also for local patches: if the local row
            // is already newer (because a realtime UPDATE arrived first),
            // skip the patch.
            if (patch.version <= current.version) return prev;
            const merged: V2OrderWithItems = {
                ...current,
                status: patch.status,
                version: patch.version,
                acknowledged_at: patch.acknowledged_at ?? current.acknowledged_at,
                ready_at: patch.ready_at ?? current.ready_at,
                delivered_at: patch.delivered_at ?? current.delivered_at,
                cancelled_at: patch.cancelled_at ?? current.cancelled_at,
                cancelled_by:
                    patch.cancelled_by !== undefined
                        ? patch.cancelled_by
                        : current.cancelled_by,
                cancellation_reason:
                    patch.cancellation_reason !== undefined
                        ? patch.cancellation_reason
                        : current.cancellation_reason
            };
            if (!isActiveStatus(merged.status)) {
                onOrderLeftBoardRef.current?.(merged);
                return prev.filter(o => o.id !== patch.id);
            }
            const next = prev.slice();
            next[idx] = merged;
            return next;
        });
    }, []);

    // ── Initial + dependency-driven refetch ──
    useEffect(() => {
        void fetchActive();
    }, [fetchActive]);

    // ── Realtime subscription ──
    useEffect(() => {
        if (!tenantId || !activityId) return;

        let channel: RealtimeChannel | null = null;
        let cancelled = false;

        function handleUpdate(row: V2Order): void {
            setOrders(prev => {
                const idx = prev.findIndex(o => o.id === row.id);
                if (idx === -1) {
                    // Race: UPDATE arrived for a row we don't track yet
                    // (initial fetch hadn't included it, e.g. it was
                    // INSERTed between fetch and subscribe). Refetch
                    // silently to recover.
                    if (isActiveStatus(row.status)) {
                        void fetchActive();
                    }
                    return prev;
                }
                const current = prev[idx];
                // Version-max gate: skip echoes and stale events.
                if (row.version <= current.version) return prev;
                const merged: V2OrderWithItems = {
                    ...current,
                    ...row,
                    items: current.items
                };
                if (!isActiveStatus(merged.status)) {
                    onOrderLeftBoardRef.current?.(merged);
                    return prev.filter(o => o.id !== row.id);
                }
                const next = prev.slice();
                next[idx] = merged;
                return next;
            });
        }

        function handleInsert(row: V2Order): void {
            if (!isActiveStatus(row.status)) return;
            // Dedup per id (postgres_changes potrebbe consegnare lo stesso
            // INSERT in rari casi di re-stream); bounded FIFO ~100.
            const seen = seenInsertsRef.current;
            if (!seen.has(row.id)) {
                seen.add(row.id);
                if (seen.size > 100) {
                    const oldest = seen.values().next().value;
                    if (oldest !== undefined) seen.delete(oldest);
                }
                // Alert sonoro/visivo SOLO per arrivi genuini di nuovi
                // ordini (submitted, non rectification). Le rettifiche
                // arrivano con status 'delivered' come righe is_rectification,
                // gia' escluse dal check status; defensive comunque.
                if (row.status === "submitted" && !row.is_rectification) {
                    onNewOrderRef.current?.(row);
                }
            }
            // postgres_changes does not deliver embedded items; refetch
            // silently to materialise the full card.
            void fetchActive();
            // Hint: avoid logging row.id to user-facing surfaces (no PII
            // anyway — payload is admin scope).
        }

        function handleDelete(id: string): void {
            setOrders(prev => prev.filter(o => o.id !== id));
        }

        channel = supabase
            .channel(`active-orders-${activityId}-${Date.now()}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "orders",
                    filter: `activity_id=eq.${activityId}`
                },
                payload => {
                    if (cancelled) return;
                    if (payload.eventType === "INSERT") {
                        handleInsert(payload.new as V2Order);
                    } else if (payload.eventType === "UPDATE") {
                        handleUpdate(payload.new as V2Order);
                    } else if (payload.eventType === "DELETE") {
                        const oldId = (payload.old as { id?: string })?.id;
                        if (oldId) handleDelete(oldId);
                    }
                }
            )
            .subscribe(status => {
                // On (re)connect refetch to recover any events lost during
                // the disconnect window. supabase-js emits "SUBSCRIBED" on
                // every successful resubscribe (including reconnects).
                if (status === "SUBSCRIBED" && !cancelled) {
                    void fetchActive();
                }
            });

        return () => {
            cancelled = true;
            // Reset dedup Set al resubscribe: la prossima sessione realtime
            // partira' con SUBSCRIBED refetch che ripopola lo state via REST,
            // quindi il primo INSERT post-resub e' di nuovo "genuino" e va
            // segnalato.
            seenInsertsRef.current.clear();
            if (channel) {
                void supabase.removeChannel(channel);
                channel = null;
            }
        };
    }, [tenantId, activityId, fetchActive]);

    return { orders, isLoading, error, refetch, applyLocalPatch };
}
