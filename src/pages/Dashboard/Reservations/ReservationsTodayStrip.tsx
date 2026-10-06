import { useMemo } from "react";
import { StatusStrip } from "@/components/ui/StatusStrip/StatusStrip";
import type { V2Reservation } from "@/types/reservation";
import { summarizeToday, todayHeadline } from "./todaySummary";

/**
 * «Oggi» in testa all'Elenco di Servizio. Le righe arrivano già filtrate per
 * sede. Le regole dei numeri stanno in `summarizeToday`.
 */
export default function ReservationsTodayStrip({ items }: { items: readonly V2Reservation[] }) {
    const summary = useMemo(() => summarizeToday(items), [items]);

    return (
        <StatusStrip
            tone="neutral"
            badge="Oggi"
            title={todayHeadline(summary)}
            figures={[
                { value: summary.count, label: summary.count === 1 ? "prenotazione" : "prenotazioni" },
                { value: `~${summary.covers}`, label: "coperti" },
                { value: summary.pendingCount, label: "da gestire" }
            ]}
        />
    );
}
