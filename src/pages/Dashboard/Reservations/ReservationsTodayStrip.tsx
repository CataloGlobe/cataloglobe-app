import { useMemo } from "react";
import { StatusStrip } from "@/components/ui/StatusStrip/StatusStrip";
import { todayIsoDate } from "@/utils/dateLocal";
import type { V2Reservation } from "@/types/reservation";

function nowHmm(): string {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * «Oggi» in testa a Prenotazioni e all'Elenco di Servizio (lotto B-b: era in
 * testa a tutte e due le schede di Prenotazioni). Le righe arrivano già
 * filtrate per sede (e, in Prenotazioni, per canale).
 */
export default function ReservationsTodayStrip({ items }: { items: readonly V2Reservation[] }) {
    const today = todayIsoDate();

    // Il banner conta quello che il locale ha accettato e quello che è già
    // successo: `confirmed + seated + completed`, UN insieme solo per conteggio
    // e coperti. Due insiemi nella stessa frase ("2 prenotazioni · ~2
    // coperti" con due tavoli da due) producono una domanda senza risposta.
    //
    // Fuori le `pending`: non sono ancora parte del servizio e sono già
    // contate in "Da gestire", nella stessa barra — contarle due volte con
    // due significati non aiuta nessuno. Fuori le sedute? No: una
    // prenotazione al tavolo non è sparita, e un conteggio che scala man mano
    // che la gente si siede direbbe "Oggi · 0 prenotazioni" a fine serata,
    // nel momento in cui il locale è più pieno.
    const todayItems = useMemo(
        () =>
            items.filter(
                r =>
                    r.reservation_date === today &&
                    (r.status === "confirmed" || r.status === "seated" || r.status === "completed")
            ),
        [items, today]
    );

    const todayCovers = useMemo(() => todayItems.reduce((s, r) => s + r.party_size, 0), [todayItems]);

    const pendingCount = useMemo(() => items.filter(r => r.status === "pending").length, [items]);

    // "Prossima" è un arrivo futuro: solo le `confirmed` con orario ≥ adesso.
    // Se sono tutte in ritardo non si disegna — corretto: non c'è nessun
    // arrivo futuro, solo ritardi, e quelli sono segnalati uno per uno
    // nell'Elenco di Servizio.
    const nextToday = useMemo(() => {
        const now = nowHmm();
        const upcoming = todayItems
            .filter(r => r.status === "confirmed" && r.reservation_time.slice(0, 5) >= now)
            .sort((a, b) => a.reservation_time.localeCompare(b.reservation_time));
        return upcoming[0] ?? null;
    }, [todayItems]);

    return (
        <StatusStrip
            tone="neutral"
            badge="Oggi"
            title={
                nextToday
                    ? `Prossimo arrivo alle ${nextToday.reservation_time.slice(0, 5)}`
                    : todayItems.length > 0
                      ? "Nessun altro arrivo oggi"
                      : "Nessuna prenotazione oggi"
            }
            figures={[
                { value: todayItems.length, label: todayItems.length === 1 ? "prenotazione" : "prenotazioni" },
                { value: `~${todayCovers}`, label: "coperti" },
                { value: pendingCount, label: "da gestire" }
            ]}
        />
    );
}
