import { useEffect, useMemo, useRef, useState } from "react";
import { getReservationAvailability } from "@/services/supabase/reservations";
import { getReservationPeriodsForDate } from "@/pages/ReservationPage/utils/reservationSlots";
import type { OpeningHoursEntry, UpcomingClosure } from "@/pages/ReservationPage/availability";

/** Come `WhenSection`: assorbe una raffica di − e + prima di chiedere al server. */
const AVAILABILITY_DEBOUNCE_MS = 200;
/** Tetto lato server (una giornata intera a 15 minuti). */
const MAX_TIMES = 96;

type Args = {
    date: string;
    partySize: string;
    hours: OpeningHoursEntry[];
    closures: UpcomingClosure[];
    pacingSlotMinutes: number;
    minNoticeMinutes: number;
    slug: string;
};

/**
 * Gli orari del giorno con la disponibilità del server, per il passo «Quando»
 * del redesign. Stessa logica di `WhenSection` (/prenota), che resta com'è
 * finché il redesign non si accende (D73): griglia ottimista finché il server
 * non risponde o se sbaglia, cache per (giorno, persone), risposte vecchie
 * scartate, prima richiesta subito e le altre dopo 200 ms.
 */
export function useSlotAvailability({ date, partySize, hours, closures, pacingSlotMinutes, minNoticeMinutes, slug }: Args) {
    const [unavailable, setUnavailable] = useState<ReadonlySet<string> | null>(null);
    const [checking, setChecking] = useState(false);
    const cacheRef = useRef<Map<string, ReadonlySet<string>>>(new Map());
    const requestSeqRef = useRef(0);
    const hasFetchedOnceRef = useRef(false);

    const party = Number.parseInt(partySize, 10);
    const partyIsValid = Number.isInteger(party) && party >= 1 && party <= 50;

    // Gli orari che esistono quel giorno, prima di sapere se accettano: è anche la lista chiesta al server.
    const baseTimes = useMemo(() => {
        if (!date) return [];
        const out: string[] = [];
        for (const period of getReservationPeriodsForDate(date, hours, closures, new Date(), pacingSlotMinutes, undefined, minNoticeMinutes)) {
            for (const slot of period.slots) if (slot.state !== "past") out.push(slot.time);
        }
        return out.slice(0, MAX_TIMES);
    }, [date, hours, closures, pacingSlotMinutes, minNoticeMinutes]);

    const key = date && partyIsValid && baseTimes.length > 0 ? `${date}|${party}` : null;

    useEffect(() => {
        if (!key) {
            setUnavailable(null);
            setChecking(false);
            return;
        }
        const cached = cacheRef.current.get(key);
        if (cached) {
            setUnavailable(cached);
            setChecking(false);
            return;
        }
        const seq = ++requestSeqRef.current;
        setChecking(true);
        const delay = hasFetchedOnceRef.current ? AVAILABILITY_DEBOUNCE_MS : 0;
        hasFetchedOnceRef.current = true;
        const timer = setTimeout(() => {
            void getReservationAvailability({ slug, reservation_date: date, party_size: party, times: baseTimes })
                .then(slots => {
                    if (seq !== requestSeqRef.current) return;
                    const blocked = new Set<string>();
                    for (const slot of slots) if (!slot.available) blocked.add(slot.time);
                    cacheRef.current.set(key, blocked);
                    setUnavailable(blocked);
                })
                .catch(() => {
                    // La disponibilità è un aiuto: in errore si torna alla griglia ottimista, il controllo resta all'invio.
                    if (seq !== requestSeqRef.current) return;
                    setUnavailable(null);
                })
                .finally(() => {
                    if (seq !== requestSeqRef.current) return;
                    setChecking(false);
                });
        }, delay);
        return () => clearTimeout(timer);
        // `baseTimes` e `party` sono già nella chiave.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, slug]);

    const periods = useMemo(
        () =>
            date
                ? getReservationPeriodsForDate(date, hours, closures, new Date(), pacingSlotMinutes, unavailable ?? undefined, minNoticeMinutes)
                : [],
        [date, hours, closures, pacingSlotMinutes, unavailable, minNoticeMinutes]
    );

    return { periods, unavailable, checking };
}
