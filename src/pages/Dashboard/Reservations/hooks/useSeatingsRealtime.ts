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
 * Cosa NON arriva da qui: le scritture su `seating_tables` (uno spostamento
 * di tavolata via `set_seating_tables`) non toccano la riga di `seatings` e
 * quella tabella non è nella publication. Da questo tablet il refetch lo fa
 * il gesto stesso; da un altro tablet lo spostamento si vede al prossimo
 * evento utile. Dichiarato, non dimenticato: se servirà, è una migration in
 * più e un secondo binding su questo stesso canale.
 *
 * Richiede `public.seatings` nella publication `supabase_realtime`
 * (migration 20260912140000).
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
