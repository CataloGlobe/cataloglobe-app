/**
 * useReservationsRealtime — debounced refetch driven by Supabase Realtime.
 *
 * Subscribes to `postgres_changes` on `public.reservations` filtered
 * server-side by `tenant_id = eq.<tenantId>`. INSERT / UPDATE / DELETE events
 * collapse into a single debounced call to `onRefetch` (300ms), so storms
 * (bulk imports, rapid undo cycles) translate to one refetch.
 *
 * Tenant safety: relies on the existing RLS SELECT policy on
 * `public.reservations` —
 *   USING (has_permission('reservations.read', activity_id))
 * The server never emits events for rows the subscriber cannot SELECT, so
 * the activity-scoped permission boundary is preserved automatically.
 *
 * Channel lifecycle: a unique channel name (`reservations-<tenantId>-<ts>`)
 * is created per mount + tenantId/enabled change. Cleanup tears down the
 * pending debounce timer and removes the channel. The `onRefetch` callback
 * is captured via ref so callers can pass an unstable function (e.g. an
 * inline `loadData`) without retriggering the subscription on every render.
 *
 * Reconnect resilience: on `SUBSCRIBED` (initial + every reconnect) the
 * hook schedules a refetch to recover events lost during the disconnect
 * window — same pattern as `useActiveOrdersRealtime.ts`.
 */

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/services/supabase/client";

const REFETCH_DEBOUNCE_MS = 300;

export function useReservationsRealtime(
    tenantId: string | null,
    enabled: boolean,
    onRefetch: () => void
): void {
    // Capture latest `onRefetch` in a ref so changes in identity do not
    // tear down + recreate the realtime channel.
    const onRefetchRef = useRef(onRefetch);
    useEffect(() => {
        onRefetchRef.current = onRefetch;
    }, [onRefetch]);

    useEffect(() => {
        if (!tenantId || !enabled) return;

        let channel: RealtimeChannel | null = null;
        let cancelled = false;
        let debounceId: ReturnType<typeof setTimeout> | null = null;

        const scheduleRefetch = () => {
            if (cancelled) return;
            if (debounceId !== null) clearTimeout(debounceId);
            debounceId = setTimeout(() => {
                debounceId = null;
                if (cancelled) return;
                onRefetchRef.current();
            }, REFETCH_DEBOUNCE_MS);
        };

        channel = supabase
            .channel(`reservations-${tenantId}-${Date.now()}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "reservations",
                    filter: `tenant_id=eq.${tenantId}`
                },
                () => scheduleRefetch()
            )
            .subscribe(status => {
                if (status === "SUBSCRIBED" && !cancelled) {
                    scheduleRefetch();
                }
            });

        return () => {
            cancelled = true;
            if (debounceId !== null) {
                clearTimeout(debounceId);
                debounceId = null;
            }
            if (channel) {
                void supabase.removeChannel(channel);
                channel = null;
            }
        };
    }, [tenantId, enabled]);
}
