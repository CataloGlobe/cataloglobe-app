import { COOKIE_CONSENT_STORAGE_KEY } from "@/config/clarity";
import {
    clarityCookieDeletions,
    parseStoredConsent,
    serializeConsent,
    type ConsentChoice,
    type StoredConsent
} from "@pages/CampaignLanding/cookieConsent";

// Effetti del consenso: storage, script di Clarity, cookie. Le decisioni stanno
// in cookieConsent.ts (puro, provato in src/tests/cookieConsent.test.ts).

type ClarityQueue = ((...args: unknown[]) => void) & { q?: unknown[][] };

declare global {
    interface Window {
        clarity?: ClarityQueue;
    }
}

const CLARITY_SCRIPT_ID = "cg-clarity";

/** Storage negato (navigazione privata, dati bloccati) = nessuna scelta salvata. */
export function readConsent(): StoredConsent | null {
    try {
        return parseStoredConsent(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
    } catch {
        return null;
    }
}

export function writeConsent(choice: ConsentChoice): void {
    try {
        window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, serializeConsent(choice, new Date()));
    } catch {
        // La scelta vale comunque per questa visita; alla prossima il banner torna.
    }
}

/**
 * Snippet ufficiale di Clarity scritto come codice: coda `window.clarity` e tag
 * asincrono. Idempotente. Il segnale `consentv2` serve alle visite dallo SEE:
 * lo si manda solo qui, cioè dopo «Accetta».
 */
export function loadClarity(projectId: string): void {
    if (document.getElementById(CLARITY_SCRIPT_ID)) return;

    const queue: ClarityQueue =
        window.clarity ??
        function clarity(...args: unknown[]) {
            (queue.q = queue.q ?? []).push(args);
        };
    window.clarity = queue;

    const script = document.createElement("script");
    script.id = CLARITY_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`;
    document.head.appendChild(script);

    window.clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
}

/** Revoca: via i cookie di Clarity, poi ricarica perché lo script in memoria smetta. */
export function revokeClarity(): void {
    for (const assignment of clarityCookieDeletions(window.location.hostname)) {
        document.cookie = assignment;
    }
    window.location.reload();
}

// Il footer riapre il banner con un evento: stanno lontani nell'albero e non
// serve un context per un solo segnale.
const OPEN_COOKIE_PREFERENCES_EVENT = "cg:open-cookie-preferences";

export function openCookiePreferences(): void {
    window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT));
}

export function onOpenCookiePreferences(handler: () => void): () => void {
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handler);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handler);
}
