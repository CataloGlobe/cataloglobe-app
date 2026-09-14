/**
 * useSeatingsRealtime — refetch debounced della schermata di servizio, guidato
 * da Supabase Realtime su `public.seatings`.
 *
 * Due operatori sullo stesso servizio sono la norma: una tavolata aperta da un
 * tablet deve comparire sull'altro. Stesso schema di `useReservationsRealtime`
 * (debounce 300ms, canale con nome unico per mount, refetch su `SUBSCRIBED`
 * per colmare gli eventi persi durante un disconnect) — riusato, non
 * reinventato.
 *
 * Filtro server-side `activity_id = eq.<activityId>`: la vista di servizio è
 * per sede, e gli eventi delle altre sedi sarebbero solo refetch inutili. La
 * sicurezza non è il filtro ma la RLS SELECT di `seatings`
 * (`has_permission('seatings.read', activity_id)`): il server non emette
 * eventi per righe che il sottoscrittore non può leggere.
 *
 * Due binding sullo stesso canale, stesso refetch:
 *   - `seatings`       → aprire / chiudere / annullare (20260912140000)
 *   - `seating_tables` → spostare la tavolata da un tavolo all'altro
 *                        (20260914100000): `set_seating_tables` scrive solo
 *                        la ponte, la riga di `seatings` non cambia, e senza
 *                        questo binding lo spostamento da un altro tablet
 *                        non si vedeva.
 * `seating_reservations` resta fuori: cambia solo insieme a `seatings`.
 *
 * Entrambe le tabelle hanno una policy SELECT (`seatings.read`): è ciò che
 * fa arrivare gli eventi al sottoscrittore. Senza, il sintomo non è un
 * errore ma un realtime che "a volte non va".
 */

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/services/supabase/client";

const REFETCH_DEBOUNCE_MS = 300;

export function useSeatingsRealtime(
    activityId: string | null,
    enabled: boolean,
    onRefetch: () => void
): void {
    const onRefetchRef = useRef(onRefetch);
    useEffect(() => {
        onRefetchRef.current = onRefetch;
    }, [onRefetch]);

    useEffect(() => {
        if (!activityId || !enabled) return;

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
            .channel(`seatings-${activityId}-${Date.now()}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "seatings",
                    filter: `activity_id=eq.${activityId}`
                },
                () => scheduleRefetch()
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "seating_tables",
                    filter: `activity_id=eq.${activityId}`
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
    }, [activityId, enabled]);
}
