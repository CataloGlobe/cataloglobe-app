/** Piccole forme di Andamento (D154), comuni ai grafici e alle righe. */

const shortDay = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });

/** «25 ago» da "YYYY-MM-DD". */
export function formatShortDay(date: string): string {
    const [y, m, d] = date.slice(0, 10).split("-").map(Number);
    return shortDay.format(new Date(Date.UTC(y, m - 1, d)));
}

/** Il colore della sede n-esima del confronto (la prima è quella che si guarda). */
export function sedeColor(index: number): string {
    return `var(--sede-${index % 5})`;
}
