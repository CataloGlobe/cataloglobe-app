// Agenda del CRM (F1-4a): Google Calendar con un account di servizio.
//
// Decisione della call del 2026-10-03: niente Google Workspace e niente OAuth
// con un token che scade dopo 7 giorni. Un account di servizio Google (chiave
// JSON nel segreto GOOGLE_SERVICE_ACCOUNT_JSON delle edge, la mette Lorenzo)
// scrive nel calendario CataloGlobe, che Alex condivide con l'email
// dell'account di servizio con il permesso «Apportare modifiche agli eventi».
// L'id del calendario sta in crm_settings.google_calendar_id.
//
// Zero import: lo usano le edge (Deno) e i test (vitest). Solo API web
// standard (fetch, crypto.subtle, btoa).

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const TIMEOUT_MS = 10_000;

export interface ServiceAccount {
    clientEmail: string;
    privateKey: string;
}

/** Legge la chiave JSON scaricata da Google Cloud. Null se manca qualcosa. */
export function parseServiceAccount(raw: string | null | undefined): ServiceAccount | null {
    if (!raw) return null;
    try {
        const json = JSON.parse(raw) as Record<string, unknown>;
        const clientEmail = typeof json.client_email === "string" ? json.client_email : "";
        const privateKey = typeof json.private_key === "string" ? json.private_key : "";
        if (!clientEmail.includes("@") || !privateKey.includes("PRIVATE KEY")) return null;
        return { clientEmail, privateKey };
    } catch {
        return null;
    }
}

function base64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlJson(value: unknown): string {
    return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToDer(pem: string): Uint8Array {
    const body = pem.replace(/-----[^-]+-----/g, "").replace(/\\n/g, "").replace(/\s+/g, "");
    const binary = atob(body);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

export function buildJwtClaims(clientEmail: string, nowSeconds: number): Record<string, unknown> {
    return {
        iss: clientEmail,
        scope: GOOGLE_CALENDAR_SCOPE,
        aud: TOKEN_URL,
        iat: nowSeconds,
        exp: nowSeconds + 3600
    };
}

/** JWT firmato RS256 per lo scambio con un access token (flusso account di servizio). */
export async function signServiceJwt(account: ServiceAccount, nowSeconds: number): Promise<string> {
    const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
    const claims = base64UrlJson(buildJwtClaims(account.clientEmail, nowSeconds));
    const key = await crypto.subtle.importKey(
        "pkcs8",
        pemToDer(account.privateKey),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
    return `${header}.${claims}.${base64Url(new Uint8Array(signature))}`;
}

export class GoogleCalendarError extends Error {
    constructor(
        message: string,
        readonly status: number
    ) {
        super(message);
    }
}

type FetchFn = typeof fetch;

export async function getAccessToken(account: ServiceAccount, fetchFn: FetchFn = fetch): Promise<string> {
    const assertion = await signServiceJwt(account, Math.floor(Date.now() / 1000));
    const res = await fetchFn(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof json.access_token !== "string") {
        throw new GoogleCalendarError(`Accesso a Google non riuscito (${res.status}).`, res.status);
    }
    return json.access_token;
}

// -----------------------------------------------------------------------------
// Evento della telefonata
// -----------------------------------------------------------------------------
export interface CallEventInput {
    appointmentId: string;
    venueName: string;
    city: string | null;
    contactName: string | null;
    phone: string | null;
    callerName: string | null;
    startsAt: string;
    endsAt: string;
    leadUrl: string | null;
    note: string | null;
}

export function buildCallEvent(input: CallEventInput): Record<string, unknown> {
    const who = input.contactName?.trim() ? ` (${input.contactName.trim()})` : "";
    const lines = [
        input.phone ? `Telefono: ${input.phone}` : null,
        input.city ? `Città: ${input.city}` : null,
        input.callerName ? `Chiama: ${input.callerName}` : null,
        input.note ? `Nota: ${input.note}` : null,
        input.leadUrl ? `Scheda: ${input.leadUrl}` : null
    ].filter(Boolean);
    return {
        summary: `Telefonata: ${input.venueName}${who}`,
        // Un evento cancellato a mano resta su Google come «cancelled» e il
        // PATCH risponde 200: lo stato esplicito lo rimette in calendario.
        status: "confirmed",
        description: lines.join("\n"),
        start: { dateTime: input.startsAt, timeZone: "Europe/Rome" },
        end: { dateTime: input.endsAt, timeZone: "Europe/Rome" },
        // Il lead non è invitato: l'account di servizio non può mandare inviti
        // e il lead riceve già conferma e promemoria su WhatsApp.
        reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] },
        extendedProperties: { private: { crm_appointment_id: input.appointmentId } }
    };
}

// -----------------------------------------------------------------------------
// Impegni del calendario (per sovrapposizioni e orari liberi)
// -----------------------------------------------------------------------------
export interface CalendarBusy {
    start: string;
    end: string;
    label: string;
    appointmentId: string | null;
}

interface GoogleEventTime {
    dateTime?: string;
    date?: string;
}

/**
 * Gli impegni che occupano: eventi confermati o provvisori, non «libero»
 * (transparency transparent), non rifiutati. Gli eventi di tutto il giorno
 * occupano il giorno intero di Roma (ferie, chiusure).
 */
export function parseCalendarEvents(items: unknown, romeDayStart: (day: string) => string): CalendarBusy[] {
    if (!Array.isArray(items)) return [];
    const out: CalendarBusy[] = [];
    for (const raw of items) {
        if (!raw || typeof raw !== "object") continue;
        const e = raw as Record<string, unknown>;
        if (e.status === "cancelled" || e.transparency === "transparent") continue;
        const start = e.start as GoogleEventTime | undefined;
        const end = e.end as GoogleEventTime | undefined;
        let s: string | null = null;
        let en: string | null = null;
        if (start?.dateTime && end?.dateTime) {
            s = start.dateTime;
            en = end.dateTime;
        } else if (start?.date && end?.date) {
            s = romeDayStart(start.date);
            en = romeDayStart(end.date);
        }
        if (!s || !en) continue;
        const props = (e.extendedProperties as { private?: Record<string, unknown> } | undefined)?.private;
        out.push({
            start: new Date(s).toISOString(),
            end: new Date(en).toISOString(),
            label: typeof e.summary === "string" && e.summary.trim() ? e.summary.trim() : "Impegno",
            appointmentId: typeof props?.crm_appointment_id === "string" ? props.crm_appointment_id : null
        });
    }
    return out;
}

// -----------------------------------------------------------------------------
// Chiamate all'API
// -----------------------------------------------------------------------------
async function call(
    token: string,
    method: string,
    path: string,
    body: unknown,
    fetchFn: FetchFn
): Promise<Record<string, unknown> | null> {
    const res = await fetchFn(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (res.status === 204) return null;
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
        const err = json.error as { message?: string } | undefined;
        throw new GoogleCalendarError(
            `Google Calendar ${res.status}: ${(err?.message ?? "errore").slice(0, 200)}`,
            res.status
        );
    }
    return json;
}

const cal = (calendarId: string) => `/calendars/${encodeURIComponent(calendarId)}`;

export async function insertEvent(token: string, calendarId: string, event: unknown, fetchFn: FetchFn = fetch) {
    const json = await call(token, "POST", `${cal(calendarId)}/events`, event, fetchFn);
    const id = json?.id;
    if (typeof id !== "string") throw new GoogleCalendarError("Google Calendar non ha restituito l'evento.", 502);
    return id;
}

export async function patchEvent(token: string, calendarId: string, eventId: string, event: unknown, fetchFn: FetchFn = fetch) {
    await call(token, "PATCH", `${cal(calendarId)}/events/${encodeURIComponent(eventId)}`, event, fetchFn);
}

/** Toglie l'evento. Già tolto (404/410) conta come riuscito. */
export async function deleteEvent(token: string, calendarId: string, eventId: string, fetchFn: FetchFn = fetch) {
    try {
        await call(token, "DELETE", `${cal(calendarId)}/events/${encodeURIComponent(eventId)}`, undefined, fetchFn);
    } catch (err) {
        if (err instanceof GoogleCalendarError && (err.status === 404 || err.status === 410)) return;
        throw err;
    }
}

export async function listEvents(
    token: string,
    calendarId: string,
    timeMin: string,
    timeMax: string,
    fetchFn: FetchFn = fetch
): Promise<unknown[]> {
    const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250"
    });
    const json = await call(token, "GET", `${cal(calendarId)}/events?${params.toString()}`, undefined, fetchFn);
    return Array.isArray(json?.items) ? (json?.items as unknown[]) : [];
}
