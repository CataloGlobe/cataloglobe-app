// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";
import { COMPANY, getEmailFooterHtml, getEmailFooterText } from "../_shared/company-config.ts";
import { checkRateLimit, RateLimitExceededError } from "../_shared/rateLimit.ts";

// ── Rate limit policy ───────────────────────────────────────────────────────
// Public endpoint (verify_jwt=false) → abuse vector for spam emails / DB
// rows / venue inbox flooding. Two parallel buckets:
//   1. per-slug: protects a single venue from a targeted flood.
//   2. per-IP:   protects against an attacker cycling many slugs.
// Both must pass; slug check runs first (more restrictive → fail-fast).

const RATE_LIMIT_SLUG_PER_MIN = 15;
const RATE_LIMIT_SLUG_WINDOW_SECONDS = 60;
const RATE_LIMIT_IP_PER_HOUR = 40;
const RATE_LIMIT_IP_WINDOW_SECONDS = 3600;

// =============================================================================
// submit-reservation
// =============================================================================
//
// Public edge function. Receives a reservation request from the venue's public
// page, validates it, inserts a `reservations` row with status='pending', and
// fires (best-effort) two emails:
//
//   1. Receipt to the customer.
//   2. Alert(s) to the venue. Recipient resolution:
//        1. `activities.reservation_notification_emails` (per-site explicit
//           list) — when non-empty, each address gets its own send so
//           recipients do not see each other.
//        2. Tenant owner email via `tenants.owner_user_id` → auth.users.
//
// Hard guarantees:
//   - tenant_id ALWAYS derived from the server-resolved activity, NEVER from
//     the request body. The body only contains the public `slug`.
//   - Activity must be `status='active'` AND `enable_reservations=true`.
//   - Email failures NEVER fail the reservation: the row is already saved.
// =============================================================================

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

// IT user-facing error catalog. Same shape as submit-review.
const ERROR_MESSAGES: Record<string, string> = {
    METHOD_NOT_ALLOWED:        "Metodo non consentito",
    INVALID_PAYLOAD:           "Dati non validi",
    INVALID_EMAIL:             "Email non valida",
    INVALID_PARTY_SIZE:        "Numero di persone non valido (1-50)",
    INVALID_DATE:              "Data non valida",
    DATE_IN_PAST:              "La data non può essere nel passato",
    INVALID_TIME:              "Orario non valido",
    NOTES_TOO_LONG:            "Le note possono contenere al massimo 500 caratteri",
    ACTIVITY_NOT_FOUND:        "Sede non trovata",
    ACTIVITY_NOT_ACTIVE:       "La sede non è attualmente disponibile",
    RESERVATIONS_DISABLED:     "La sede non accetta prenotazioni online",
    RATE_LIMITED:              "Troppe richieste. Riprova più tardi.",
    SERVER_ERROR:              "Errore durante l'invio della richiesta"
};

function errorResponse(
    code: string,
    status: number,
    details?: Record<string, unknown>,
    extraHeaders?: Record<string, string>
): Response {
    const message = ERROR_MESSAGES[code] ?? "Si è verificato un errore";
    return new Response(
        JSON.stringify({
            error_code: code,
            error: message,
            message,
            ...(details ? { details } : {})
        }),
        {
            status,
            headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
                ...(extraHeaders ?? {})
            }
        }
    );
}

// Extract the client IP from the standard Edge runtime headers. Same pattern
// used by submit-review. Fallback "unknown" pools all unidentifiable callers
// into a single bucket — acceptable for low-frequency abuse.
function extractClientIp(req: Request): string {
    const xff = req.headers.get("x-forwarded-for") ?? "";
    const first = xff.split(",")[0]?.trim();
    if (first && first.length > 0) return first;
    const real = req.headers.get("x-real-ip");
    if (real && real.trim().length > 0) return real.trim();
    return "unknown";
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

// --- Validation helpers ------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

// Escape user-controlled text before injecting it into the HTML email body.
// Without this an attacker could submit `<a href="phish">...` in customer_name
// or notes and phish the venue admin who receives the alert email.
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function todayUtcIsoDate(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// "YYYY-MM-DD" → "15 giugno 2026" (Italian long date).
function formatDateIt(isoDate: string): string {
    // Parse as local-zone date (no UTC shift) so "2026-06-15" stays June 15.
    const [y, m, d] = isoDate.split("-").map(n => parseInt(n, 10));
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    return new Intl.DateTimeFormat("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(dt);
}

// "HH:MM:SS" or "HH:MM" → "HH:MM".
function formatTimeIt(time: string): string {
    return time.slice(0, 5);
}

function reservationReceiptReason(activityName: string): string {
    return `Hai ricevuto questa email perché hai richiesto una prenotazione presso ${activityName} tramite CataloGlobe.`;
}

function reservationVenueAlertReason(activityName: string): string {
    return `Hai ricevuto questa email perché gestisci ${activityName} su CataloGlobe.`;
}

// --- Recipient resolution (isolated block — future priority 1 plugs in here) -

type RecipientSource = "per_site" | "owner";

interface ResolvedRecipients {
    emails: string[];
    source: RecipientSource;
}

/**
 * Resolve the venue alert recipients in priority order:
 *
 *   1. `activities.reservation_notification_emails` — when non-empty, the
 *      caller sends one separate email per recipient (no BCC) so they do
 *      not see each other.
 *   2. Tenant owner email via `tenants.owner_user_id` → `auth.users`.
 *
 * Returns null when no recipient is resolvable. Caller skips the alert and
 * logs a warning.
 */
async function resolveAlertRecipients(
    supabase: ReturnType<typeof createClient>,
    activity: { tenant_id: string; reservation_notification_emails: string[] | null }
): Promise<ResolvedRecipients | null> {
    // 1. Per-site explicit list. Trim, drop empties, dedup case-insensitive.
    const rawList = activity.reservation_notification_emails ?? [];
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const raw of rawList) {
        const trimmed = (raw ?? "").trim();
        if (trimmed.length === 0) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        cleaned.push(trimmed);
    }
    if (cleaned.length > 0) return { emails: cleaned, source: "per_site" };

    // 2. Tenant owner email via service_role admin API.
    const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select("owner_user_id")
        .eq("id", activity.tenant_id)
        .maybeSingle();

    if (tenantError) {
        console.error("[submit-reservation] tenant lookup failed:", tenantError);
        return null;
    }
    if (!tenant?.owner_user_id) return null;

    const { data: ownerData, error: ownerError } = await supabase.auth.admin.getUserById(
        tenant.owner_user_id
    );
    if (ownerError) {
        console.error("[submit-reservation] owner lookup failed:", ownerError);
        return null;
    }
    const ownerEmail = ownerData?.user?.email;
    if (!ownerEmail) return null;

    return { emails: [ownerEmail], source: "owner" };
}

// --- Email bodies ------------------------------------------------------------

function buildCustomerReceiptEmail(args: {
    activityName: string;
    date: string;
    time: string;
    partySize: number;
    customerName: string;
}): { subject: string; html: string; text: string } {
    const { activityName, date, time, partySize, customerName } = args;
    const eActivityName = escapeHtml(activityName);
    const eCustomerName = escapeHtml(customerName);
    const dateIt = formatDateIt(date);
    const timeIt = formatTimeIt(time);
    const eDate = escapeHtml(dateIt);
    const eTime = escapeHtml(timeIt);
    const reason = reservationReceiptReason(activityName);
    const subject = `Abbiamo ricevuto la tua richiesta di prenotazione — ${activityName}`;
    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:40px">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
        <h1 style="margin:0 0 16px;font-size:22px;color:#111827">Richiesta di prenotazione ricevuta</h1>
        <p style="margin:0 0 8px;font-size:15px;color:#374151">Ciao ${eCustomerName},</p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">
            abbiamo ricevuto la tua richiesta di prenotazione presso <strong>${eActivityName}</strong>.
            Riceverai una conferma via email non appena verrà approvata dal locale.
        </p>
        <div style="margin:0 0 24px;padding:16px;background:#f3f4f6;border-radius:8px">
            <p style="margin:0 0 4px;font-size:13px;color:#6b7280">Dettagli</p>
            <p style="margin:0;font-size:15px;color:#111827"><strong>Data:</strong> ${eDate}</p>
            <p style="margin:0;font-size:15px;color:#111827"><strong>Ora:</strong> ${eTime}</p>
            <p style="margin:0;font-size:15px;color:#111827"><strong>Persone:</strong> ${partySize}</p>
        </div>
        <p style="margin:0;font-size:13px;color:#6b7280">
            Questo non è ancora una conferma. La prenotazione è in attesa di approvazione.
        </p>
        ${getEmailFooterHtml(reason)}
    </div>
</div>`;
    const text =
        `Ciao ${customerName},\n\n` +
        `abbiamo ricevuto la tua richiesta di prenotazione presso ${activityName}.\n` +
        `Riceverai una conferma via email non appena verrà approvata dal locale.\n\n` +
        `Dettagli\n` +
        `Data: ${dateIt}\n` +
        `Ora: ${timeIt}\n` +
        `Persone: ${partySize}\n\n` +
        `Questo non è ancora una conferma. La prenotazione è in attesa di approvazione.\n\n` +
        `${getEmailFooterText(reason)}`;
    return { subject, html, text };
}

function buildVenueAlertEmail(args: {
    activityName: string;
    date: string;
    time: string;
    partySize: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    notes: string | null;
}): { subject: string; html: string; text: string } {
    const { activityName, date, time, partySize, customerName, customerEmail, customerPhone, notes } = args;
    const eActivityName = escapeHtml(activityName);
    const eCustomerName = escapeHtml(customerName);
    const eCustomerEmail = escapeHtml(customerEmail);
    const eCustomerPhone = escapeHtml(customerPhone);
    const dateIt = formatDateIt(date);
    const timeIt = formatTimeIt(time);
    const eDate = escapeHtml(dateIt);
    const eTime = escapeHtml(timeIt);
    const eNotes = notes ? escapeHtml(notes) : null;
    const reason = reservationVenueAlertReason(activityName);
    const subject = `Nuova richiesta di prenotazione — ${activityName}`;
    const notesBlockHtml = eNotes
        ? `<p style="margin:8px 0 0;font-size:15px;color:#111827"><strong>Note:</strong> ${eNotes}</p>`
        : "";
    const notesBlockText = notes ? `Note: ${notes}\n` : "";
    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:40px">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
        <h1 style="margin:0 0 16px;font-size:22px;color:#111827">Nuova richiesta di prenotazione</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">
            Hai ricevuto una nuova richiesta di prenotazione su <strong>${eActivityName}</strong>.
            Accedi alla dashboard per confermarla o rifiutarla.
        </p>
        <div style="margin:0 0 24px;padding:16px;background:#f3f4f6;border-radius:8px">
            <p style="margin:0 0 4px;font-size:13px;color:#6b7280">Cliente</p>
            <p style="margin:0;font-size:15px;color:#111827"><strong>${eCustomerName}</strong></p>
            <p style="margin:0;font-size:14px;color:#374151">${eCustomerEmail}</p>
            <p style="margin:0;font-size:14px;color:#374151">${eCustomerPhone}</p>
        </div>
        <div style="margin:0 0 24px;padding:16px;background:#f3f4f6;border-radius:8px">
            <p style="margin:0 0 4px;font-size:13px;color:#6b7280">Prenotazione</p>
            <p style="margin:0;font-size:15px;color:#111827"><strong>Data:</strong> ${eDate}</p>
            <p style="margin:0;font-size:15px;color:#111827"><strong>Ora:</strong> ${eTime}</p>
            <p style="margin:0;font-size:15px;color:#111827"><strong>Persone:</strong> ${partySize}</p>
            ${notesBlockHtml}
        </div>
        ${getEmailFooterHtml(reason)}
    </div>
</div>`;
    const text =
        `Nuova richiesta di prenotazione su ${activityName}.\n` +
        `Accedi alla dashboard per confermarla o rifiutarla.\n\n` +
        `Cliente\n` +
        `${customerName}\n` +
        `${customerEmail}\n` +
        `${customerPhone}\n\n` +
        `Prenotazione\n` +
        `Data: ${dateIt}\n` +
        `Ora: ${timeIt}\n` +
        `Persone: ${partySize}\n` +
        notesBlockText +
        `\n${getEmailFooterText(reason)}`;
    return { subject, html, text };
}

// --- Handler -----------------------------------------------------------------

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
        return errorResponse("METHOD_NOT_ALLOWED", 405);
    }

    try {
        const body = (await req.json()) as Record<string, unknown>;

        // ── Field validation ────────────────────────────────────────
        const slug = typeof body.slug === "string" ? body.slug.trim() : "";
        if (!slug) {
            return errorResponse("INVALID_PAYLOAD", 400, { field: "slug", reason: "required" });
        }

        const reservationDate = typeof body.reservation_date === "string" ? body.reservation_date.trim() : "";
        if (!reservationDate || !DATE_RE.test(reservationDate)) {
            return errorResponse("INVALID_DATE", 400);
        }
        if (reservationDate < todayUtcIsoDate()) {
            return errorResponse("DATE_IN_PAST", 400);
        }

        const reservationTime = typeof body.reservation_time === "string" ? body.reservation_time.trim() : "";
        if (!reservationTime || !TIME_RE.test(reservationTime)) {
            return errorResponse("INVALID_TIME", 400);
        }

        const partySizeRaw = body.party_size;
        if (
            typeof partySizeRaw !== "number" ||
            !Number.isInteger(partySizeRaw) ||
            partySizeRaw < 1 ||
            partySizeRaw > 50
        ) {
            return errorResponse("INVALID_PARTY_SIZE", 400);
        }
        const partySize = partySizeRaw;

        const customerName = typeof body.customer_name === "string" ? body.customer_name.trim() : "";
        if (!customerName) {
            return errorResponse("INVALID_PAYLOAD", 400, { field: "customer_name", reason: "required" });
        }
        if (customerName.length > 200) {
            return errorResponse("INVALID_PAYLOAD", 400, { field: "customer_name", reason: "too_long" });
        }

        const customerEmail = typeof body.customer_email === "string" ? body.customer_email.trim() : "";
        if (!customerEmail || !EMAIL_RE.test(customerEmail) || customerEmail.length > 320) {
            return errorResponse("INVALID_EMAIL", 400);
        }

        const customerPhone = typeof body.customer_phone === "string" ? body.customer_phone.trim() : "";
        if (!customerPhone) {
            return errorResponse("INVALID_PAYLOAD", 400, { field: "customer_phone", reason: "required" });
        }
        if (customerPhone.length > 50) {
            return errorResponse("INVALID_PAYLOAD", 400, { field: "customer_phone", reason: "too_long" });
        }

        let notes: string | null = null;
        if (body.notes !== undefined && body.notes !== null) {
            if (typeof body.notes !== "string") {
                return errorResponse("INVALID_PAYLOAD", 400, { field: "notes", reason: "type" });
            }
            const trimmed = body.notes.trim();
            if (trimmed.length > 500) {
                return errorResponse("NOTES_TOO_LONG", 400);
            }
            notes = trimmed.length > 0 ? trimmed : null;
        }

        // ── Supabase client (service_role) ──────────────────────────
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // ── Rate limit (slug-first, then IP) ────────────────────────
        // Fail-closed (same pattern as resolve-table): RPC failure
        // bubbles up to the outer catch and surfaces as 500. Limit hit
        // → 429 with Retry-After header. No DB row, no email.
        const clientIp = extractClientIp(req);
        try {
            await checkRateLimit(supabase, {
                key: `submit-reservation:slug:${slug}`,
                limit: RATE_LIMIT_SLUG_PER_MIN,
                windowSeconds: RATE_LIMIT_SLUG_WINDOW_SECONDS
            });
            await checkRateLimit(supabase, {
                key: `submit-reservation:ip:${clientIp}`,
                limit: RATE_LIMIT_IP_PER_HOUR,
                windowSeconds: RATE_LIMIT_IP_WINDOW_SECONDS
            });
        } catch (rlErr) {
            if (rlErr instanceof RateLimitExceededError) {
                return errorResponse(
                    "RATE_LIMITED",
                    429,
                    { retry_after_seconds: rlErr.retryAfterSeconds },
                    { "Retry-After": String(rlErr.retryAfterSeconds) }
                );
            }
            throw rlErr;
        }

        // ── Resolve slug → activity (server-side; tenant_id NEVER from body)
        const { data: activity, error: activityError } = await supabase
            .from("activities")
            .select("id, tenant_id, name, slug, status, enable_reservations, reservation_notification_emails")
            .eq("slug", slug)
            .maybeSingle();

        if (activityError) throw activityError;
        if (!activity) {
            return errorResponse("ACTIVITY_NOT_FOUND", 404);
        }
        if (activity.status !== "active") {
            return errorResponse("ACTIVITY_NOT_ACTIVE", 409);
        }
        if (activity.enable_reservations !== true) {
            return errorResponse("RESERVATIONS_DISABLED", 409);
        }

        // ── Insert reservation (status='pending', source='online',
        //    server-derived tenant_id) ─────────────────────────────────
        const { data: inserted, error: insertError } = await supabase
            .from("reservations")
            .insert({
                tenant_id: activity.tenant_id,
                activity_id: activity.id,
                reservation_date: reservationDate,
                reservation_time: reservationTime,
                party_size: partySize,
                customer_name: customerName,
                customer_email: customerEmail,
                customer_phone: customerPhone,
                notes,
                status: "pending",
                source: "online"
            })
            .select("id")
            .single();

        if (insertError) throw insertError;
        const reservationId = inserted.id;

        // ── Best-effort emails (failures NEVER fail the reservation) ─────────
        const customerEmailBody = buildCustomerReceiptEmail({
            activityName: activity.name,
            date: reservationDate,
            time: reservationTime,
            partySize,
            customerName
        });

        // Customer receipt
        try {
            await resend.emails.send({
                from: COMPANY.email.sender,
                reply_to: COMPANY.contact.support,
                to: customerEmail,
                subject: customerEmailBody.subject,
                html: customerEmailBody.html,
                text: customerEmailBody.text
            });
        } catch (mailErr) {
            console.error("[submit-reservation] customer receipt email failed:", mailErr);
        }

        // Venue alert(s) — one separate send per recipient so addresses
        // never see each other. allSettled isolates failures: a single
        // bounced address does not block the others.
        try {
            const recipients = await resolveAlertRecipients(supabase, {
                tenant_id: activity.tenant_id,
                reservation_notification_emails: activity.reservation_notification_emails
            });
            if (!recipients) {
                console.warn(
                    `[submit-reservation] no alert recipient resolvable (reservation_id=${reservationId}, activity_id=${activity.id}). Skipping alert.`
                );
            } else {
                console.log(
                    `[submit-reservation] alert resolved (reservation_id=${reservationId}, source=${recipients.source}, count=${recipients.emails.length}).`
                );
                const venueBody = buildVenueAlertEmail({
                    activityName: activity.name,
                    date: reservationDate,
                    time: reservationTime,
                    partySize,
                    customerName,
                    customerEmail,
                    customerPhone,
                    notes
                });
                const results = await Promise.allSettled(
                    recipients.emails.map(to =>
                        resend.emails.send({
                            from: COMPANY.email.sender,
                            reply_to: COMPANY.contact.support,
                            to,
                            subject: venueBody.subject,
                            html: venueBody.html,
                            text: venueBody.text
                        })
                    )
                );
                results.forEach((r, i) => {
                    if (r.status === "rejected") {
                        console.error(
                            `[submit-reservation] venue alert email failed for ${recipients.emails[i]}:`,
                            r.reason
                        );
                    }
                });
            }
        } catch (mailErr) {
            console.error("[submit-reservation] venue alert resolver failed:", mailErr);
        }

        return jsonResponse({ success: true, reservation_id: reservationId }, 200);
    } catch (err) {
        console.error("[submit-reservation] error:", err);
        return errorResponse("SERVER_ERROR", 500);
    }
});
