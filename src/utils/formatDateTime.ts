/**
 * Formattazione di data e ora in italiano.
 *
 * Estratto da due copie byte-identiche di `formatAbsolute`, che vivevano
 * inline in `src/pages/Status/StatusPage.tsx` e
 * `src/pages/Admin/StatusIncidents/StatusIncidentsPage.tsx`. Stesso locale,
 * stesse opzioni, stesso fallback: un move puro, nessun cambiamento di output.
 *
 * ── Altre copie ancora in giro ──────────────────────────────────────────────
 * `formatAbsolute` esiste anche in `OrderDetailDrawer.tsx`, `PrintReceipt.tsx`
 * e `TableDetailDrawer.tsx`. Le prime due sono equivalenti a questa (stesse
 * opzioni, firma piu' stretta: `string` invece di `string | null | undefined`)
 * e sono assorbibili.
 *
 * `TableDetailDrawer` NO: il suo formatter omette `year` e stampa "27/08, 11:04"
 * invece di "27/08/2026, 11:04". E' una variante voluta — nella vista live dei
 * tavoli l'anno e' rumore — e assorbirla cambierebbe cio' che si vede a
 * schermo. Va decisa, non unificata di slancio.
 */

// Formatter a livello di modulo: costruire un Intl.DateTimeFormat a ogni
// chiamata (come faceva `toLocaleString` nelle due copie originali) e'
// sprecato in una lista. Output identico; e' l'idioma gia' usato dalle altre
// tre copie del progetto.
const DATE_TIME_IT = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
});

/**
 * "2026-08-27T09:04:00Z" → "27/08/2026, 11:04" (fuso locale del browser).
 *
 * Accetta null/undefined e ritorna "—": i timestamp che formatta sono spesso
 * opzionali (`resolved_at`, `closed_at`) e il fallback evita un ternario a
 * ogni call site.
 */
export function formatDateTimeIt(iso: string | null | undefined): string {
    if (!iso) return "—";
    return DATE_TIME_IT.format(new Date(iso));
}
