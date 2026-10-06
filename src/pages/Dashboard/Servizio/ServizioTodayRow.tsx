import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { todayIsoDate } from "@/utils/dateLocal";
import { countPendingReservationsByActivity, listReservations } from "@/services/supabase/reservations";
import type { V2Reservation } from "@/types/reservation";
import { summarizeToday, todayHeadline } from "@/pages/Dashboard/Reservations/todaySummary";
import styles from "./Servizio.module.scss";

/** Ogni quanto la riga si rilegge da sé: è un riepilogo, non il banco. */
const REFRESH_MS = 60_000;

type ServizioTodayRowProps = {
    tenantId: string;
    activityId: string;
    /** Dove porta «N richieste da gestire →»: le Prenotazioni della sede. */
    requestsHref: string;
};

/**
 * La riga «Oggi» del Servizio (correzioni UI T14 SV1), uguale in Elenco e
 * Mappa: una riga sola con il prossimo arrivo, le prenotazioni accettate, i
 * coperti e, se ci sono, «N richieste da gestire →» verso le Prenotazioni.
 * I numeri seguono `summarizeToday`; le richieste sono il conteggio della
 * sede usato anche in Sedi. Il chiamante la monta solo per chi legge le
 * prenotazioni della sede.
 */
export default function ServizioTodayRow({ tenantId, activityId, requestsHref }: ServizioTodayRowProps) {
    const [items, setItems] = useState<V2Reservation[] | null>(null);
    const [pending, setPending] = useState(0);

    const load = useCallback(async () => {
        const today = todayIsoDate();
        try {
            const [rows, counts] = await Promise.all([
                listReservations(tenantId, { from: today, to: today }, activityId),
                countPendingReservationsByActivity(tenantId)
            ]);
            setItems(rows);
            setPending(counts[activityId] ?? 0);
        } catch {
            // Un riepilogo che non arriva non si inventa: la riga non c'è.
            setItems(null);
        }
    }, [tenantId, activityId]);

    useEffect(() => {
        void load();
        const timer = setInterval(() => void load(), REFRESH_MS);
        return () => clearInterval(timer);
    }, [load]);

    const summary = useMemo(() => (items ? summarizeToday(items) : null), [items]);
    if (!summary) return null;

    const facts = [
        todayHeadline(summary),
        `${summary.count} ${summary.count === 1 ? "prenotazione" : "prenotazioni"}`,
        summary.count > 0 ? `~${summary.covers} coperti` : null
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <div className={styles.todayRow} role="status" aria-label="Oggi">
            <Badge variant="neutral">Oggi</Badge>
            <Text as="span" variant="body-sm" className={styles.todayFacts}>
                {facts}
            </Text>
            {pending > 0 && (
                <Link to={requestsHref} className={styles.todayRequests}>
                    {pending} {pending === 1 ? "richiesta da gestire" : "richieste da gestire"}
                    <ArrowRight size={14} strokeWidth={2} aria-hidden />
                </Link>
            )}
        </div>
    );
}
