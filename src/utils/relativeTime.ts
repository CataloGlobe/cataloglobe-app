/**
 * Formatta un timestamp ISO in stringa relativa italiana.
 *
 * Esempi:
 *   < 1 min:   "adesso"
 *   < 60 min:  "5 minuti fa"
 *   < 24 h:    "2 ore fa"
 *   < 7 g:     "3 giorni fa"
 *   >= 7 g:    "DD mes." (es. "12 mar")
 *
 * Logica originale estratta da NotificationsDrawer:formatRelativeTime.
 */
export function formatRelativeTime(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "adesso";
    if (diffMins < 60) return `${diffMins} minut${diffMins === 1 ? "o" : "i"} fa`;
    if (diffHours < 24) return `${diffHours} or${diffHours === 1 ? "a" : "e"} fa`;
    if (diffDays < 7) return `${diffDays} giorn${diffDays === 1 ? "o" : "i"} fa`;
    return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}
