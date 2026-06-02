/**
 * useTablesLiveRealtime — live state for the admin "Tavoli" tab.
 *
 * Owns `V2TableWithState[]` for a given (tenantId, activityId). Backed by:
 *
 *   1. Initial REST fetch via `listTablesWithState` (derived view
 *      `v_tables_with_state` joining tables + customer_sessions + orders +
 *      order_groups).
 *   2. Supabase Realtime postgres_changes on the 3 source tables of the
 *      view (orders / order_groups / customer_sessions), filtered server-
 *      side by `activity_id = eq.<activityId>` AND by the caller's RLS
 *      SELECT policies (`has_permission('orders.read'|'tables.read',
 *      activity_id)`). The server never emits events for rows the caller
 *      cannot SELECT — this is the security boundary.
 *
 * Strategy: derived view, no incremental patching. Any event on any of
 * the 3 source tables triggers a debounced refetch of `listTablesWithState`
 * (250ms window). Multiple events within the window collapse into one
 * refetch.
 *
 * Single channel with 3 `.on('postgres_changes')` bindings:
 *   - one SUBSCRIBED lifecycle → one refetch on (re)connect (resilient to
 *     flaky dining-room wifi).
 *   - one `removeChannel` on cleanup.
 *
 * No ticking timer, no polling: the view is push-driven by realtime; the
 * caller can request a manual refetch via the returned `refetch`.
 *
 * Tenant safety: subscription runs on the singleton (user JWT) supabase
 * client — never service_role.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/services/supabase/client";
import { listTablesWithState } from "@/services/supabase/tables";
import type { V2TableWithState } from "@/types/orders";

const REFETCH_DEBOUNCE_MS = 250;

export interface UseTablesLiveRealtimeResult {
    items: V2TableWithState[];
    isLoading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

export function useTablesLiveRealtime(
    tenantId: string | null,
    activityId: string | null
): UseTablesLiveRealtimeResult {
    const [items, setItems] = useState<V2TableWithState[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAll = useCallback(async (): Promise<void> => {
        if (!tenantId || !activityId) {
            setItems([]);
            setIsLoading(false);
            return;
        }
        setError(null);
        try {
            const data = await listTablesWithState(tenantId, activityId);
            setItems(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Errore caricamento tavoli");
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, activityId]);

    const refetch = useCallback(async (): Promise<void> => {
        await fetchAll();
    }, [fetchAll]);

    // Latest fetcher captured via ref so the channel handler (debounced)
    // always calls the current version after deps change without
    // resubscribing on every render.
    const fetchAllRef = useRef(fetchAll);
    fetchAllRef.current = fetchAll;

    // Initial + deps-driven refetch.
    useEffect(() => {
        void fetchAll();
    }, [fetchAll]);

    // Realtime subscription: 1 channel, 3 bindings.
    useEffect(() => {
        if (!tenantId || !activityId) return;

        let cancelled = false;
        let debounceId: number | null = null;
        let channel: RealtimeChannel | null = null;

        function scheduleRefetch(): void {
            if (cancelled) return;
            if (debounceId !== null) {
                window.clearTimeout(debounceId);
            }
            debounceId = window.setTimeout(() => {
                debounceId = null;
                if (cancelled) return;
                void fetchAllRef.current();
            }, REFETCH_DEBOUNCE_MS);
        }

        const filter = `activity_id=eq.${activityId}`;

        channel = supabase
            .channel(`tables-live-${activityId}-${Date.now()}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "orders", filter },
                () => scheduleRefetch()
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "order_groups", filter },
                () => scheduleRefetch()
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "customer_sessions", filter },
                () => scheduleRefetch()
            )
            .subscribe(status => {
                // On (re)connect refetch to recover any events lost
                // during the disconnect window. supabase-js emits
                // "SUBSCRIBED" on every successful (re)subscribe.
                if (status === "SUBSCRIBED" && !cancelled) {
                    void fetchAllRef.current();
                }
            });

        return () => {
            cancelled = true;
            if (debounceId !== null) {
                window.clearTimeout(debounceId);
                debounceId = null;
            }
            if (channel) {
                void supabase.removeChannel(channel);
                channel = null;
            }
        };
    }, [tenantId, activityId]);

    return { items, isLoading, error, refetch };
}
