/**
 * Testi degli avvisi di capienza e pacing del form di prenotazione. Gli
 * stessi per i numeri del server (`get_reservation_capacity_check`) e per il
 * calcolo in memoria che fa da ripiego.
 */

export function overCapacityMessage(peakWithCandidate: number, capacity: number | null): string | null {
    if (capacity === null || peakWithCandidate <= capacity) return null;
    return `Questa prenotazione porta a ${peakWithCandidate} coperti su ${capacity} di capienza. Puoi salvarla lo stesso.`;
}

export type PacingNumbers = {
    /** Minuti dalla mezzanotte dell'orario della prenotazione. */
    timeMinutes: number;
    slotMinutes: number;
    maxCovers: number | null;
    maxBookings: number | null;
    /** Arrivi già nella fascia, la prenotazione esclusa. */
    bucketCovers: number;
    bucketBookings: number;
    partySize: number;
};

// Deve dire DI QUANTO si sfora e QUALE tetto, altrimenti l'host non sa se sta
// aggiungendo un tavolo di troppo o cinque.
export function pacingMessage(n: PacingNumbers): string | null {
    if (n.maxCovers === null && n.maxBookings === null) return null;
    if (!Number.isFinite(n.slotMinutes) || n.slotMinutes <= 0) return null;

    const slotStart = Math.floor(n.timeMinutes / n.slotMinutes) * n.slotMinutes;
    const fmt = (min: number): string =>
        `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
    const slotLabel = `${fmt(slotStart)}–${fmt(slotStart + n.slotMinutes)}`;

    const covers = n.bucketCovers + n.partySize;
    const bookings = n.bucketBookings + 1;
    const messages: string[] = [];
    if (n.maxCovers !== null && covers > n.maxCovers) {
        messages.push(`${covers} persone contro un limite di ${n.maxCovers} (${covers - n.maxCovers} in più)`);
    }
    if (n.maxBookings !== null && bookings > n.maxBookings) {
        messages.push(
            `${bookings} prenotazioni contro un limite di ${n.maxBookings} (${bookings - n.maxBookings} in più)`
        );
    }
    if (messages.length === 0) return null;

    return `Nella fascia ${slotLabel} questa prenotazione porta a ${messages.join(" e ")}. Puoi salvarla lo stesso: il limite vale solo per le prenotazioni online.`;
}
