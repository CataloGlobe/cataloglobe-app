import type { VenueStatus } from "./venueStatus";

/** Nome del giorno nella lingua della pagina, con la maiuscola che gli spetta (lunedì, Montag, Monday). */
function weekdayName(dow: number, lang: string): string {
    // 1 gennaio 2024 era un lunedì.
    return new Intl.DateTimeFormat(lang, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + dow)));
}

/**
 * Parole dello stato del locale («Aperto», «Chiude tra 20 min», «Chiuso · apre
 * domani alle 12:00»): le stesse nell'isola e nella riga Orari del foglio.
 */
export function venueStatusLabel(status: VenueStatus, t: (key: string, o?: Record<string, unknown>) => string, lang: string): string | null {
    switch (status.kind) {
        case "unknown":
            return null;
        case "open":
            return t("venue.open");
        case "closing-soon":
            return t("venue.closing_soon", { minutes: status.minutes });
        case "closed": {
            const next = status.opensAt;
            if (!next) return t("venue.closed");
            if (next.dayOffset === 0) return t("venue.closed_opens_today", { time: next.time });
            if (next.dayOffset === 1) return t("venue.closed_opens_tomorrow", { time: next.time });
            return t("venue.closed_opens_day", { day: weekdayName(next.dow, lang), time: next.time });
        }
    }
}
