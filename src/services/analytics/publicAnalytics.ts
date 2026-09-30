/**
 * Public page analytics — fire-and-forget event tracking.
 *
 * Uses navigator.sendBeacon (with fetch fallback) so events survive
 * page close. Never blocks the UI — all errors are silenced.
 */

import { randomUuid } from "@/utils/randomUuid";

export type EventType =
    | "page_view"
    | "product_detail_open"
    | "selection_add"
    | "selection_remove"
    | "selection_sheet_open"
    | "featured_click"
    | "featured_cta_click"
    | "social_click"
    | "search_performed"
    | "tab_switch"
    | "section_view"
    | "review_submitted"
    | "review_google_redirect";

// ── Session-level constants (computed once at module load) ────────────

function getDeviceType(): "mobile" | "tablet" | "desktop" {
    // SSR: modulo importato anche server-side (albero CollectionView), dove
    // window non esiste. trackEvent gira comunque solo client-side.
    if (typeof window === "undefined") return "desktop";
    const w = window.innerWidth;
    if (w < 768) return "mobile";
    if (w <= 1024) return "tablet";
    return "desktop";
}

type Session = { id: string; deviceType: "mobile" | "tablet" | "desktop"; screenWidth: number };

/**
 * Inizializzazione al caricamento del modulo, che le pagine pubbliche importano
 * subito: un errore qui non deve mai bloccare il rendering. Se fallisce,
 * `SESSION` resta null e gli eventi semplicemente non vengono tracciati.
 */
function initSession(): Session | null {
    try {
        return {
            id: randomUuid(),
            deviceType: getDeviceType(),
            screenWidth: typeof window === "undefined" ? 0 : window.innerWidth
        };
    } catch {
        return null;
    }
}

const SESSION = initSession();

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/log-analytics-event`;

// ── Public API ───────────────────────────────────────────────────────

export function trackEvent(
    activityId: string,
    eventType: EventType,
    metadata?: Record<string, unknown>
): void {
    if (!SESSION) return;
    try {
        const payload = JSON.stringify({
            activity_id: activityId,
            event_type: eventType,
            metadata: metadata ?? {},
            session_id: SESSION.id,
            device_type: SESSION.deviceType,
            screen_width: SESSION.screenWidth
        });

        const blob = new Blob([payload], { type: "text/plain" });

        if (navigator.sendBeacon) {
            navigator.sendBeacon(ENDPOINT, blob);
        } else {
            fetch(ENDPOINT, {
                method: "POST",
                body: payload,
                headers: { "Content-Type": "application/json" },
                keepalive: true
            }).catch(() => {});
        }
    } catch {
        // Never throw — fire-and-forget
    }
}
