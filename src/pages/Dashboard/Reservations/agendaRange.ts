import { agendaWeekRange } from "./loadWindow";

// Le date della settimana dell'Agenda: servono alla vista e alla testata
// della pagina (T14), che mostra la settimana con ‹ ›.

export function parseLocalDate(iso: string): Date {
    const [y, m, d] = iso.split("-").map(n => parseInt(n, 10));
    return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export /** Short range label tuned for a compact toolbar.
 *  Same month → "1–7 giu". Cross-month same year → "30 giu – 6 lug".
 *  Cross-year → "29 dic 2026 – 4 gen 2027". */
function formatRangeLabel(start: Date, end: Date): string {
    const sameMonth =
        start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    const sameYear = start.getFullYear() === end.getFullYear();
    if (sameMonth) {
        const monthShort = new Intl.DateTimeFormat("it-IT", { month: "short" }).format(end);
        return `${start.getDate()}–${end.getDate()} ${monthShort}`;
    }
    if (sameYear) {
        const sMonth = new Intl.DateTimeFormat("it-IT", { month: "short" }).format(start);
        const eMonth = new Intl.DateTimeFormat("it-IT", { month: "short" }).format(end);
        return `${start.getDate()} ${sMonth} – ${end.getDate()} ${eMonth}`;
    }
    const fmt = new Intl.DateTimeFormat("it-IT", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
    return `${fmt.format(start)} – ${fmt.format(end)}`;
}

/** «1–7 giu» per la settimana `weekOffset` da quella di oggi. */
export function agendaRangeLabel(today: string, weekOffset: number): string {
    const { from, to } = agendaWeekRange(today, weekOffset);
    return formatRangeLabel(parseLocalDate(from), parseLocalDate(to));
}
