// Pure formatting helpers shared by the transactional email builders.
//
// These used to live as byte-identical copies inside submit-reservation and
// respond-reservation. Behaviour is preserved exactly — this module is a
// move, not a rewrite. Keep it free of I/O (no env, no network, no DB) so
// the email builders that depend on it stay testable.

/**
 * Escape user-controlled text before injecting it into an HTML email body.
 * Without this an attacker could submit `<a href="phish">...` in
 * customer_name or notes and phish the venue admin who receives the alert.
 */
export function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** "YYYY-MM-DD" → "15 giugno 2026" (Italian long date). */
export function formatDateIt(isoDate: string): string {
    // Parse as local-zone date (no UTC shift) so "2026-06-15" stays June 15.
    const [y, m, d] = isoDate.split("-").map(n => parseInt(n, 10));
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    return new Intl.DateTimeFormat("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(dt);
}

/** "HH:MM:SS" or "HH:MM" → "HH:MM". */
export function formatTimeIt(time: string): string {
    return time.slice(0, 5);
}
