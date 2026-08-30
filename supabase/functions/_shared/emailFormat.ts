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

/**
 * BCP 47 locale per each language we write customer emails in. A long date is
 * one of the places where a machine translation gives itself away: "31 agosto
 * 2026" reads wrong to a German, whose calendar says "31. August 2026".
 *
 * The map is intentionally not exhaustive over BCP 47 — it covers exactly the
 * languages in `reservationEmailCopy.ts`, and `formatDate` falls back to
 * Italian for anything else, mirroring the copy fallback.
 */
const DATE_LOCALES: Record<string, string> = {
    it: "it-IT",
    // en-GB, not en-US: a European venue writing "31 August 2026" is right for
    // its audience, "August 31, 2026" is not.
    en: "en-GB",
    fr: "fr-FR",
    de: "de-DE",
    es: "es-ES"
};

/**
 * "YYYY-MM-DD" → long date in the given language.
 *   it → "15 giugno 2026"   en → "15 June 2026"     fr → "15 juin 2026"
 *   de → "15. Juni 2026"    es → "15 de junio de 2026"
 *
 * Unknown or absent language → Italian, same fallback as the copy.
 */
export function formatDate(isoDate: string, lang?: string | null): string {
    // Parse as local-zone date (no UTC shift) so "2026-06-15" stays June 15.
    const [y, m, d] = isoDate.split("-").map(n => parseInt(n, 10));
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    const locale = (typeof lang === "string" ? DATE_LOCALES[lang] : undefined) ?? "it-IT";
    return new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(dt);
}

/**
 * "YYYY-MM-DD" → "15 giugno 2026" (Italian long date).
 *
 * Kept as a named entry point rather than folded into `formatDate`: the venue
 * emails are Italian by product decision, not by fallback, and calling this
 * says so at the call site. Byte-identical to the pre-i18n behaviour.
 */
export function formatDateIt(isoDate: string): string {
    return formatDate(isoDate, "it");
}

/**
 * "HH:MM:SS" or "HH:MM" → "HH:MM".
 *
 * Deliberately NOT locale-aware, and not because it was overlooked: all five
 * languages we write to use the 24-hour clock, so `Intl` would return "20:30"
 * for every one of them. Routing through `Intl` would mean parsing the string
 * into a Date — a way to fail on input this function currently survives — to
 * produce the same five characters. The day an en-US audience appears, this is
 * where the AM/PM branch goes.
 */
export function formatTimeIt(time: string): string {
    return time.slice(0, 5);
}
