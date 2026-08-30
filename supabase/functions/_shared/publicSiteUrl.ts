// Reader for the public base URL of the app (`APP_URL`).
//
// `APP_URL` is the pre-existing single source of truth for the frontend URL
// (see the comment in `generate-table-qrs`). Those older consumers still read
// the env var directly; moving them onto this helper is separate work.
//
// Kept OUT of `emailFormat.ts` on purpose: that module is pure and must stay
// importable from a plain test runner, while this one touches `Deno.env` and
// keeps process-wide state (the warn-once latch). Same reason the email
// builders take the base URL as a parameter instead of reading it themselves.
//
// Expected value: absolute origin without a trailing slash, e.g.
//   https://cataloglobe.com
// A trailing slash is tolerated and stripped.
//
// FAIL-SAFE: a missing or malformed value NEVER throws and never blocks an
// email. Callers degrade to link-less copy. A reservation confirmation must
// go out even when the deploy is misconfigured.

const ENV_KEY = "APP_URL";

let warned = false;

function warnOnce(message: string): void {
    if (warned) return;
    warned = true;
    console.warn(`[publicSiteUrl] ${message}`);
}

/**
 * Return the configured public base URL without its trailing slash, or null
 * when unset / blank / not a valid absolute http(s) URL.
 */
export function getPublicSiteUrl(): string | null {
    let raw: string | undefined;
    try {
        raw = Deno.env.get(ENV_KEY);
    } catch {
        // Env access denied (no --allow-env). Treat as unset.
        warnOnce(`${ENV_KEY} is not readable. Emails will be sent without links.`);
        return null;
    }

    const trimmed = (raw ?? "").trim();
    if (trimmed.length === 0) {
        warnOnce(`${ENV_KEY} is not set. Emails will be sent without links.`);
        return null;
    }

    const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
    let parsed: URL;
    try {
        parsed = new URL(withoutTrailingSlash);
    } catch {
        warnOnce(`${ENV_KEY} is not a valid URL. Emails will be sent without links.`);
        return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        warnOnce(`${ENV_KEY} must be http(s). Emails will be sent without links.`);
        return null;
    }

    return withoutTrailingSlash;
}

// Admin route of the reservations page, from `src/App.tsx`:
//   <Route path="/business/:businessId"> … <Route path="reservations" />
// `businessId` IS the tenant id — `TenantProvider` resolves it as
// `tenants.find(t => t.id === businessId)`.
const RESERVATIONS_ROUTE = (tenantId: string) => `/business/${tenantId}/reservations`;

/**
 * Absolute URL of the reservations dashboard for a tenant, or null when the
 * base URL is unconfigured (callers degrade to link-less copy) or the tenant
 * id is missing/blank.
 *
 * Never throws: a missing datum must not stop an email from going out, and
 * the call sites run under `@ts-nocheck`, so a null slipping through is not
 * caught at compile time.
 */
export function buildReservationsDashboardUrl(
    tenantId: string | null | undefined
): string | null {
    const base = getPublicSiteUrl();
    if (!base) return null;
    if (typeof tenantId !== "string") return null;
    const id = tenantId.trim();
    if (id.length === 0) return null;
    return `${base}${RESERVATIONS_ROUTE(encodeURIComponent(id))}`;
}

// Public route of the customer cancellation page, from
// `src/routes/publicRoutes.tsx`: `/:slug/prenotazione/annulla`, token in the
// query string. The language-aware variant is not used here — the email is
// composed server side and does not know which language the diner reads; the
// page falls back to the tenant's base language, as `/:slug/prenota` does.
const RESERVATION_CANCEL_ROUTE = (slug: string) => `/${slug}/prenotazione/annulla`;

/**
 * Absolute URL of the self-service cancellation page for one reservation, or
 * null when the base URL is unconfigured or either argument is missing.
 *
 * Never throws, for the same reason as the dashboard URL above: a missing
 * datum degrades the email to link-less copy, it does not stop it from going
 * out. The token is percent-encoded even though the format is base64url and
 * has nothing to escape — the encoding is the caller's guarantee, not the
 * format's.
 */
export function buildReservationCancelUrl(
    slug: string | null | undefined,
    token: string | null | undefined
): string | null {
    return buildTokenPageUrl(RESERVATION_CANCEL_ROUTE, slug, token);
}

// Public route of the attendance-confirmation page, from
// `src/routes/publicRoutes.tsx`: `/:slug/prenotazione/conferma`.
const RESERVATION_CONFIRM_ROUTE = (slug: string) => `/${slug}/prenotazione/conferma`;

/**
 * Absolute URL of the attendance-confirmation page for one reservation, or
 * null when the base URL is unconfigured or either argument is missing.
 *
 * The token behind this URL carries `act: "confirm"` and cannot cancel
 * anything — see `_shared/reservationToken.ts`.
 */
export function buildReservationConfirmUrl(
    slug: string | null | undefined,
    token: string | null | undefined
): string | null {
    return buildTokenPageUrl(RESERVATION_CONFIRM_ROUTE, slug, token);
}

/** Shared body of the two builders above: same guards, same encoding. */
function buildTokenPageUrl(
    route: (slug: string) => string,
    slug: string | null | undefined,
    token: string | null | undefined
): string | null {
    const base = getPublicSiteUrl();
    if (!base) return null;
    if (typeof slug !== "string" || typeof token !== "string") return null;
    const cleanSlug = slug.trim();
    const cleanToken = token.trim();
    if (cleanSlug.length === 0 || cleanToken.length === 0) return null;
    return `${base}${route(encodeURIComponent(cleanSlug))}?token=${encodeURIComponent(cleanToken)}`;
}

// Support thread routes, from `src/App.tsx`. Two of them because the two sides
// of a ticket live in two different areas of the app:
//   business  → <Route path="support"><Route path=":ticketId" /></Route>
//               nested under /business/:businessId, where businessId IS the
//               tenant id (same as the reservations dashboard above).
//   platform  → <Route path="supporto"><Route path=":ticketId" /></Route>
//               nested under /admin, gated by `is_platform_admin()`. No tenant
//               in the path: a platform admin is not scoped to one.
// The Italian segment on the admin side and the English one on the business
// side are how the routes are actually declared — not a typo to be fixed here.
const SUPPORT_TICKET_ROUTE = (tenantId: string, ticketId: string) =>
    `/business/${tenantId}/support/${ticketId}`;
const SUPPORT_ADMIN_TICKET_ROUTE = (ticketId: string) => `/admin/supporto/${ticketId}`;

/**
 * Absolute URL of a support thread in the business dashboard, or null when the
 * base URL is unconfigured or either id is missing/blank.
 *
 * Never throws, same fail-safe as the two builders above: the notification
 * email goes out without a link rather than not going out. The ids are
 * percent-encoded even though both are UUIDs with nothing to escape — the
 * encoding is this function's guarantee, not the caller's promise.
 */
export function buildSupportTicketUrl(
    tenantId: string | null | undefined,
    ticketId: string | null | undefined
): string | null {
    const base = getPublicSiteUrl();
    if (!base) return null;
    if (typeof tenantId !== "string" || typeof ticketId !== "string") return null;
    const cleanTenantId = tenantId.trim();
    const cleanTicketId = ticketId.trim();
    if (cleanTenantId.length === 0 || cleanTicketId.length === 0) return null;
    return `${base}${SUPPORT_TICKET_ROUTE(
        encodeURIComponent(cleanTenantId),
        encodeURIComponent(cleanTicketId)
    )}`;
}

/**
 * Absolute URL of a support thread in the platform admin area, or null when
 * the base URL is unconfigured or the ticket id is missing/blank.
 *
 * No tenant argument by design: `/admin` is not tenant-scoped.
 */
export function buildSupportAdminTicketUrl(
    ticketId: string | null | undefined
): string | null {
    const base = getPublicSiteUrl();
    if (!base) return null;
    if (typeof ticketId !== "string") return null;
    const cleanTicketId = ticketId.trim();
    if (cleanTicketId.length === 0) return null;
    return `${base}${SUPPORT_ADMIN_TICKET_ROUTE(encodeURIComponent(cleanTicketId))}`;
}
