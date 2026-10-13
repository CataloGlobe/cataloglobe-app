import type { VenueStatus } from "./venueStatus";

/** Nome del giorno nella lingua della pagina, con la maiuscola che gli spetta (lunedì, Montag, Monday; corto: lun, Mo, Mon). */
function weekdayName(dow: number, lang: string, short = false): string {
    // 1 gennaio 2024 era un lunedì.
    return new Intl.DateTimeFormat(lang, { weekday: short ? "short" : "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + dow)));
}

/**
 * Parole dello stato del locale («Aperto», «Chiude tra 20 min», «Chiuso · apre
 * domani alle 12:00»), nella riga Orari del foglio e nel fondo pagina. `short`
 * per la pillola dell'isola, dove lo spazio è poco: «Chiuso · domani 12:00»,
 * «Chiuso · lun 12:00» (deciso da Lorenzo il 2026-10-11); la frase intera resta
 * il nome accessibile.
 */
export function venueStatusLabel(
    status: VenueStatus,
    t: (key: string, o?: Record<string, unknown>) => string,
    lang: string,
    short = false
): string | null {
    const suffix = short ? "_short" : "";
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
            if (next.dayOffset === 0) return t(`venue.closed_opens_today${suffix}`, { time: next.time });
            if (next.dayOffset === 1) return t(`venue.closed_opens_tomorrow${suffix}`, { time: next.time });
            return t(`venue.closed_opens_day${suffix}`, { day: weekdayName(next.dow, lang, short), time: next.time });
        }
    }
}

/**
 * Lo stato nei fogli (⋯, Informazioni, Orari), dove c'è spazio: aperto dice anche
 * quando chiude, «Aperto · chiude alle 23:30» (mockup v38); il resto come sopra.
 */
export function venueStatusSheetLabel(
    status: VenueStatus,
    t: (key: string, o?: Record<string, unknown>) => string,
    lang: string
): string | null {
    if (status.kind === "open" && status.closesAt) return t("venue.open_until", { time: status.closesAt });
    return venueStatusLabel(status, t, lang);
}
