/**
 * Public page analytics — fire-and-forget event tracking.
 *
 * Uses navigator.sendBeacon (with fetch fallback) so events survive
 * page close. Never blocks the UI — all errors are silenced.
 */

export type EventType =
    | "page_view"
    | "product_detail_open"
    | "selection_add"
    | "selection_remove"
    | "selection_sheet_open"
    | "featured_click"
    | "social_click"
    | "search_performed"
    | "tab_switch"
    | "section_view"
    | "review_submitted"
    | "review_google_redirect";

// ── Session-level constants (computed once at module load) ────────────

const SESSION_ID = crypto.randomUUID();

function getDeviceType(): "mobile" | "tablet" | "desktop" {
    const w = window.innerWidth;
    if (w < 768) return "mobile";
    if (w <= 1024) return "tablet";
    return "desktop";
}

const DEVICE_TYPE = getDeviceType();
const SCREEN_WIDTH = window.innerWidth;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/log-analytics-event`;

// ── Public API ───────────────────────────────────────────────────────

export function trackEvent(
    activityId: string,
    eventType: EventType,
    metadata?: Record<string, unknown>
): void {
    try {
        const payload = JSON.stringify({
            activity_id: activityId,
            event_type: eventType,
            metadata: metadata ?? {},
            session_id: SESSION_ID,
            device_type: DEVICE_TYPE,
            screen_width: SCREEN_WIDTH
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
