import { useEffect, useState } from "react";
import {
    getReservationCapacityCheck,
    type ReservationCapacityCheck,
    type ReservationCapacityCheckInput
} from "@/services/supabase/reservations";

const DEBOUNCE_MS = 300;

function inputKey(input: ReservationCapacityCheckInput): string {
    return [
        input.activityId,
        input.date,
        input.time.slice(0, 5),
        input.partySize,
        input.excludeReservationId ?? ""
    ].join("|");
}

/**
 * I numeri di capienza e pacing chiesti al server
 * (`get_reservation_capacity_check`) per l'avviso del form e il callout del
 * drawer.
 *
 * Restituisce i numeri solo se rispondono all'input di adesso: mentre la
 * risposta arriva, o se la RPC fallisce, `null`. Chi chiama, con `null`, usa
 * il calcolo sulle righe in memoria: l'avviso non deve sparire perché la rete
 * è lenta. `refreshKey` (es. l'elenco delle prenotazioni in memoria) richiede
 * i numeri di nuovo quando arriva una prenotazione dal realtime.
 */
export function useServerCapacityCheck(
    input: ReservationCapacityCheckInput | null,
    refreshKey?: unknown
): ReservationCapacityCheck | null {
    const key = input ? inputKey(input) : null;
    const [result, setResult] = useState<{ key: string; check: ReservationCapacityCheck } | null>(
        null
    );

    useEffect(() => {
        if (!input || !key) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            getReservationCapacityCheck(input).then(
                check => {
                    if (!cancelled) setResult({ key, check });
                },
                () => {
                    // Errore = "non lo so": si torna al calcolo in memoria.
                    if (!cancelled) setResult(prev => (prev?.key === key ? null : prev));
                }
            );
        }, DEBOUNCE_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // `key` riassume `input`: un oggetto nuovo con gli stessi valori non
        // deve richiedere i numeri.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, refreshKey]);

    return result && result.key === key ? result.check : null;
}
