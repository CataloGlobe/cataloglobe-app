/**
 * useReservationsRealtime — eventi Supabase Realtime applicati in memoria.
 *
 * Subscribes to `postgres_changes` on `public.reservations` filtered
 * server-side by `tenant_id = eq.<tenantId>`. Gli eventi INSERT / UPDATE /
 * DELETE NON ricaricano la pagina (FASE 5.2a): vengono accumulati e
 * consegnati a `onEvents` in un'unica raffica ogni 300ms, e la pagina li
 * applica alle righe che ha già (`applyRealtimeEvents`). Una riga fuori dalla
 * finestra caricata si scarta lì, non qui: l'hook non sa cosa la pagina
 * mostra. Prima di questa fase ogni evento rifaceva l'intera fetch —
 * dell'intera tabella.
 *
 * `new` porta la riga completa su INSERT/UPDATE; su DELETE `old` ha solo la
 * chiave (REPLICA IDENTITY DEFAULT), e basta: si toglie per id.
 *
 * Tenant safety: relies on the existing RLS SELECT policy on
 * `public.reservations` —
 *   USING (has_permission('reservations.read', activity_id))
 * The server never emits events for rows the subscriber cannot SELECT, so
 * the activity-scoped permission boundary is preserved automatically.
 *
 * Channel lifecycle: a unique channel name (`reservations-<tenantId>-<ts>`)
 * is created per mount + tenantId/enabled change. Cleanup tears down the
 * pending flush timer and removes the channel. Both callbacks are captured
 * via ref so callers can pass unstable functions without retriggering the
 * subscription on every render.
 *
 * Reconnect resilience: on `SUBSCRIBED` (initial + every reconnect) the
 * hook calls `onResync` — l'unico caso in cui la pagina rilegge la finestra,
 * perché durante il buco di connessione gli eventi sono andati persi. Same
 * pattern as `useActiveOrdersRealtime.ts`.
 */

import { useEffect, useRef } from "react";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import { supabase } from "@/services/supabase/client";
import type { V2Reservation } from "@/types/reservation";
import type { ReservationRealtimeEvent } from "../loadWindow";

const FLUSH_DEBOUNCE_MS = 300;

function toEvent(
    payload: RealtimePostgresChangesPayload<V2Reservation>
): ReservationRealtimeEvent | null {
    if (payload.eventType === "DELETE") {
        const id = (payload.old as Partial<V2Reservation>).id;
        return id ? { type: "DELETE", id } : null;
    }
    const row = payload.new as V2Reservation;
    return row.id ? { type: payload.eventType, row } : null;
}

export function useReservationsRealtime(
    tenantId: string | null,
    enabled: boolean,
    onEvents: (events: ReservationRealtimeEvent[]) => void,
    onResync: () => void
): void {
    const onEventsRef = useRef(onEvents);
    const onResyncRef = useRef(onResync);
    useEffect(() => {
        onEventsRef.current = onEvents;
        onResyncRef.current = onResync;
    }, [onEvents, onResync]);

    useEffect(() => {
        if (!tenantId || !enabled) return;

        let channel: RealtimeChannel | null = null;
        let cancelled = false;
        let flushId: ReturnType<typeof setTimeout> | null = null;
        let queue: ReservationRealtimeEvent[] = [];

        const scheduleFlush = () => {
            if (cancelled || flushId !== null) return;
            flushId = setTimeout(() => {
                flushId = null;
                if (cancelled || queue.length === 0) return;
                const batch = queue;
                queue = [];
                onEventsRef.current(batch);
            }, FLUSH_DEBOUNCE_MS);
        };

        channel = supabase
            .channel(`reservations-${tenantId}-${Date.now()}`)
            .on<V2Reservation>(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "reservations",
                    filter: `tenant_id=eq.${tenantId}`
                },
                payload => {
                    const event = toEvent(payload);
                    if (!event) return;
                    queue.push(event);
                    scheduleFlush();
                }
            )
            .subscribe(status => {
                if (status === "SUBSCRIBED" && !cancelled) {
                    // Gli eventi in coda sono già coperti dalla rilettura.
                    queue = [];
                    onResyncRef.current();
                }
            });

        return () => {
            cancelled = true;
            if (flushId !== null) {
                clearTimeout(flushId);
                flushId = null;
            }
            queue = [];
            if (channel) {
                void supabase.removeChannel(channel);
                channel = null;
            }
        };
    }, [tenantId, enabled]);
}
