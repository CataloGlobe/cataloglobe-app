import {
    CLARITY_HOSTNAME,
    CLARITY_PATHS,
    COOKIE_CONSENT_MONTHS,
    COOKIE_CONSENT_VERSION
} from "@/config/clarity";

// Logica pura del consenso ai cookie della landing: niente DOM, niente storage.
// Gli effetti (localStorage, script, cookie) stanno in cookieConsentBrowser.ts.

export type ConsentChoice = "accepted" | "rejected";

export type StoredConsent = {
    version: number;
    choice: ConsentChoice;
    /** ISO 8601. */
    decidedAt: string;
};

export function serializeConsent(choice: ConsentChoice, now: Date): string {
    const record: StoredConsent = {
        version: COOKIE_CONSENT_VERSION,
        choice,
        decidedAt: now.toISOString()
    };
    return JSON.stringify(record);
}

/** Valore illeggibile o di forma sbagliata = nessuna scelta. */
export function parseStoredConsent(raw: string | null): StoredConsent | null {
    if (!raw) return null;
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof value !== "object" || value === null) return null;
    const { version, choice, decidedAt } = value as Record<string, unknown>;
    if (typeof version !== "number") return null;
    if (choice !== "accepted" && choice !== "rejected") return null;
    if (typeof decidedAt !== "string" || Number.isNaN(Date.parse(decidedAt))) return null;
    return { version, choice, decidedAt };
}

/** Scadenza di calendario: stessa data, sei mesi dopo. */
export function consentExpiresAt(consent: StoredConsent): Date {
    const expires = new Date(consent.decidedAt);
    expires.setMonth(expires.getMonth() + COOKIE_CONSENT_MONTHS);
    return expires;
}

/** Scelta della versione in vigore e non ancora scaduta. */
export function isConsentCurrent(consent: StoredConsent | null, now: Date): consent is StoredConsent {
    if (!consent) return false;
    if (consent.version !== COOKIE_CONSENT_VERSION) return false;
    return now.getTime() < consentExpiresAt(consent).getTime();
}

export function shouldShowBanner(consent: StoredConsent | null, now: Date): boolean {
    return !isConsentCurrent(consent, now);
}

export function isClarityPage(hostname: string, pathname: string): boolean {
    return hostname === CLARITY_HOSTNAME && CLARITY_PATHS.includes(pathname);
}

export function shouldLoadClarity(input: {
    hostname: string;
    pathname: string;
    consent: StoredConsent | null;
    now: Date;
}): boolean {
    const { hostname, pathname, consent, now } = input;
    if (!isClarityPage(hostname, pathname)) return false;
    return isConsentCurrent(consent, now) && consent.choice === "accepted";
}

const CLARITY_COOKIES = ["_clck", "_clsk"] as const;
const EXPIRED = "expires=Thu, 01 Jan 1970 00:00:00 GMT";

/**
 * Assegnazioni a `document.cookie` che cancellano i cookie di Clarity. Clarity
 * li scrive sul dominio radice (`.cataloglobe.com`) e, se non ci riesce, sul
 * dominio corrente: si cancellano entrambe le varianti.
 */
export function clarityCookieDeletions(hostname: string): string[] {
    const parts = hostname.split(".");
    const domains = new Set<string>();
    // Ogni suffisso con almeno due etichette: www.cataloglobe.com → .www.cataloglobe.com, .cataloglobe.com
    for (let i = 0; i < parts.length - 1; i++) {
        domains.add("." + parts.slice(i).join("."));
    }
    return CLARITY_COOKIES.flatMap((name) => [
        `${name}=; ${EXPIRED}; path=/`,
        ...[...domains].map((domain) => `${name}=; ${EXPIRED}; path=/; domain=${domain}`)
    ]);
}
