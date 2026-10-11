import { useEffect, useRef, useState } from "react";
import type { OpeningHoursEntry, UpcomingClosure } from "@components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";
import { computeVenueStatus, type VenueStatus } from "./venueStatus";

/** Millisecondi al prossimo minuto pieno, così lo stato cambia sul minuto e non a metà. */
function msToNextMinute(): number {
    return 60_000 - (Date.now() % 60_000) + 50;
}

function sameStatus(a: VenueStatus, b: VenueStatus): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === "closing-soon" && b.kind === "closing-soon") return a.minutes === b.minutes;
    if (a.kind === "closed" && b.kind === "closed") {
        return a.opensAt?.dayOffset === b.opensAt?.dayOffset && a.opensAt?.time === b.opensAt?.time;
    }
    return true;
}

/**
 * Stato del locale, ricalcolato a ogni minuto. Un solo timer, fermo a scheda
 * nascosta; al ritorno si ricalcola subito. `setState` solo se lo stato cambia,
 * così un minuto uguale al precedente non fa render.
 */
export function useVenueStatus(
    hours: OpeningHoursEntry[],
    closures: UpcomingClosure[]
): VenueStatus {
    const [status, setStatus] = useState<VenueStatus>(() => computeVenueStatus(new Date(), hours, closures));
    // Orari e chiusure arrivano nuovi a ogni render del padre: si leggono da qui, il timer non riparte.
    const inputs = useRef({ hours, closures });
    inputs.current = { hours, closures };

    useEffect(() => {
        let timer: number | undefined;
        const update = () => {
            const next = computeVenueStatus(new Date(), inputs.current.hours, inputs.current.closures);
            setStatus(prev => (sameStatus(prev, next) ? prev : next));
        };
        const schedule = () => {
            timer = window.setTimeout(() => {
                update();
                schedule();
            }, msToNextMinute());
        };
        const onVisibility = () => {
            window.clearTimeout(timer);
            if (document.visibilityState === "visible") {
                update();
                schedule();
            }
        };
        update();
        if (document.visibilityState === "visible") schedule();
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, []);

    return status;
}
