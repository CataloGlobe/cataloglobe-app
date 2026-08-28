// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";
import { COMPANY } from "../_shared/company-config.ts";
import { checkRateLimit, RateLimitExceededError } from "../_shared/rateLimit.ts";
import { formatDateIt, formatTimeIt } from "../_shared/emailFormat.ts";
import {
    buildReservationCancelUrl,
    buildReservationsDashboardUrl
} from "../_shared/publicSiteUrl.ts";
import { resolveAlertRecipients } from "../_shared/reservationAlertRecipients.ts";
import { signReservationToken } from "../_shared/reservationToken.ts";
import { normalizePhoneToE164 } from "../_shared/phoneNormalize.ts";
import {
    buildReservationConfirmedEmail,
    buildReservationReceiptEmail,
    buildReservationVenueAlertEmail
} from "../_shared/reservationEmails.ts";

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

// Diner-facing subscription allowlist. Same set as `_shared/checkOrderingState`
// (the orders surface): `past_due` is a grace state with full access (card in
// retry for ~2 weeks before cancellation), so the public menu and reservations
// stay open during it. Anything outside this set (`canceled`/`suspended`)
// blocks. Kept inline rather than via checkOrderingState because that helper
// also gates ordering-specific state (ordering_enabled, table_ordering plan
// feature) that is irrelevant to reservations.
const VALID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

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
//   - Tenant subscription_status must be in the diner-facing allowlist
//     (active|trialing|past_due); canceled/suspended are blocked (423).
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
    SUBSCRIPTION_INACTIVE:     "La sede non è attualmente disponibile",
    RESERVATIONS_DISABLED:     "La sede non accetta prenotazioni online",
    FEATURE_NOT_AVAILABLE:     "Le prenotazioni non sono disponibili per questa attività",
    CAPACITY_FULL:             "Non ci sono più posti per l'orario scelto",
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

function todayUtcIsoDate(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
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
        // The select keeps `reservation_notification_emails` for the venue
        // alert recipient resolver. Capacity/duration/mode columns are NOT
        // read here anymore — the RPC `place_online_reservation` owns the
        // capacity decision under its advisory lock (single source of truth).
        const { data: activity, error: activityError } = await supabase
            .from("activities")
            .select(
                "id, tenant_id, name, slug, status, enable_reservations, " +
                "reservation_notification_emails"
            )
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

        // ── Subscription gate ─────────────────────────────────────────
        // Closes a fail-open: until now a canceled/suspended venue could
        // still take reservations via a direct Edge call (only activity.status
        // + enable_reservations were checked). Mirror the diner-facing
        // allowlist + `subscription_inactive` reason that checkOrderingState
        // enforces for orders. 423 (Locked) matches submit-order's treatment
        // of the same condition. Fail-closed: missing/deleted tenant or a
        // status outside the allowlist blocks.
        const { data: tenant, error: tenantStateError } = await supabase
            .from("tenants")
            .select("subscription_status, deleted_at")
            .eq("id", activity.tenant_id)
            .maybeSingle();
        if (tenantStateError) throw tenantStateError;
        if (
            !tenant ||
            tenant.deleted_at !== null ||
            !VALID_SUBSCRIPTION_STATUSES.has(tenant.subscription_status)
        ) {
            return errorResponse("SUBSCRIPTION_INACTIVE", 423);
        }

        // ── Plan-based feature gate ───────────────────────────────────
        // Belt-and-suspenders with the BEFORE INSERT trigger on `reservations`
        // that raises FEATURE_NOT_AVAILABLE; this pre-check turns the would-be
        // DB error into a clean codified response. Fail-closed: any non-true
        // result (false, null, RPC error) blocks the request.
        const { data: hasReservationFeature, error: featErr } = await supabase
            .rpc("activity_has_feature", {
                p_activity_id: activity.id,
                p_feature_id: "table_reservation"
            });
        if (featErr || hasReservationFeature !== true) {
            return errorResponse("FEATURE_NOT_AVAILABLE", 409);
        }

        // ── Atomic capacity gate + insert (Step 3) ─────────────────────
        // One RPC under pg_advisory_xact_lock → no two concurrent submits
        // can both confirm into the same slot. The RPC encapsulates the
        // capacity engine that previously lived in this file as a Deno port.
        //
        // Return contract (single row):
        //   status='confirmed' → auto-confirmed (auto + capacity set + under)
        //   status='pending'   → admin will decide (manuale, or auto+soft over)
        //   status='full'      → caller surfaces 409 CAPACITY_FULL
        const { data: placement, error: placementError } = await supabase
            .rpc("place_online_reservation", {
                p_activity_id:      activity.id,
                p_reservation_date: reservationDate,
                p_reservation_time: reservationTime,
                p_party_size:       partySize,
                p_customer_name:    customerName,
                p_customer_email:   customerEmail,
                p_customer_phone:   customerPhone,
                p_notes:            notes,
                p_source:           "online"
            })
            .single();

        if (placementError) throw placementError;
        if (!placement) {
            console.error("[submit-reservation] RPC returned no row");
            return errorResponse("SERVER_ERROR", 500);
        }

        const placementStatus = placement.status as "confirmed" | "pending" | "full";
        const placementPeak = placement.peak as number | null;
        const placementCapacity = placement.capacity as number | null;

        if (placementStatus === "full") {
            return errorResponse("CAPACITY_FULL", 409, {
                capacity: placementCapacity,
                peak_with_candidate: placementPeak
            });
        }

        const reservationId = placement.reservation_id as string;
        const isAutoConfirmed = placementStatus === "confirmed";

        // ── Canonical phone, E.164 (best-effort) ─────────────────────────
        // `place_online_reservation` owns the INSERT and is deliberately left
        // untouched, so the canonical value is written right after with a
        // targeted UPDATE of that single column. `customer_phone` keeps the
        // raw string; this is the lookup key for the future guest profile.
        //
        // A failure here NEVER fails the reservation and never propagates:
        // the E.164 value is recomputable from the raw phone, a lost booking
        // is not. Logs carry the reservation id and the DB message only —
        // never the number itself.
        try {
            const phoneE164 = normalizePhoneToE164(customerPhone);
            if (phoneE164) {
                const { error: phoneUpdateError } = await supabase
                    .from("reservations")
                    .update({ customer_phone_e164: phoneE164 })
                    .eq("id", reservationId);
                if (phoneUpdateError) {
                    console.error(
                        `[submit-reservation] phone canonicalisation failed (reservation_id=${reservationId}):`,
                        phoneUpdateError.message
                    );
                }
            } else {
                console.log(
                    `[submit-reservation] phone not canonicalisable (reservation_id=${reservationId}). Leaving customer_phone_e164 NULL.`
                );
            }
        } catch (phoneErr) {
            console.error(
                `[submit-reservation] phone canonicalisation threw (reservation_id=${reservationId}):`,
                phoneErr instanceof Error ? phoneErr.message : "unknown error"
            );
        }

        // ── Best-effort emails (failures NEVER fail the reservation) ─────────
        // Auto-confirmed path uses the "Prenotazione confermata" template,
        // mirrors the wording of respond-reservation's confirm outcome. The
        // standard "Richiesta ricevuta" receipt covers the pending path
        // (manuale or auto+soft-over).
        // Signed self-service cancellation link. Best-effort like everything
        // else in this block: if the secret is missing the email loses the
        // link, it does not lose the email. The token has no expiry — what
        // gates the cancellation is the reservation status and the venue
        // cutoff, both checked server side on every call.
        let cancelUrl: string | null = null;
        try {
            cancelUrl = buildReservationCancelUrl(
                slug,
                await signReservationToken(reservationId)
            );
            if (!cancelUrl) {
                console.warn(
                    `[submit-reservation] cancellation link unavailable (reservation_id=${reservationId}). Email sent without it.`
                );
            }
        } catch (tokenErr) {
            console.error(
                `[submit-reservation] cancellation token minting failed (reservation_id=${reservationId}):`,
                tokenErr instanceof Error ? tokenErr.message : "unknown error"
            );
        }

        const customerEmailBody = isAutoConfirmed
            ? buildReservationConfirmedEmail({
                  activityName: activity.name,
                  reservationDate,
                  reservationTime,
                  partySize,
                  customerName,
                  // Auto-confirm: the diner never had a pending request.
                  variant: "auto",
                  cancelUrl
              })
            : buildReservationReceiptEmail({
                  activityName: activity.name,
                  reservationDate,
                  reservationTime,
                  partySize,
                  customerName,
                  cancelUrl
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
            const recipients = await resolveAlertRecipients(
                supabase,
                {
                    tenant_id: activity.tenant_id,
                    reservation_notification_emails: activity.reservation_notification_emails
                },
                "submit-reservation"
            );
            if (!recipients) {
                console.warn(
                    `[submit-reservation] no alert recipient resolvable (reservation_id=${reservationId}, activity_id=${activity.id}). Skipping alert.`
                );
            } else {
                console.log(
                    `[submit-reservation] alert resolved (reservation_id=${reservationId}, source=${recipients.source}, count=${recipients.emails.length}).`
                );
                const venueBody = buildReservationVenueAlertEmail({
                    activityName: activity.name,
                    reservationDate,
                    reservationTime,
                    partySize,
                    customerName,
                    customerEmail,
                    customerPhone,
                    notes,
                    // Deep link to the tenant's reservations dashboard. null
                    // when APP_URL is unset → alert still goes out,
                    // just without the link.
                    dashboardUrl: buildReservationsDashboardUrl(activity.tenant_id),
                    // Same `isAutoConfirmed` that picks the customer template:
                    // on the auto path there is nothing to confirm or decline.
                    variant: isAutoConfirmed ? "autoConfirmed" : "request"
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

        // ── In-app notification fan-out (best-effort) ────────────────────
        // One row per user with `reservations.manage` on this activity.
        // Resolution via the SECURITY DEFINER helper
        // `public.get_users_with_activity_permission(permission, activity)`
        // (service_role only). Failures NEVER fail the reservation —
        // the row is already saved and emails were already sent above.
        try {
            const { data: recipientIds, error: rpcError } = await supabase.rpc(
                "get_users_with_activity_permission",
                {
                    p_permission_id: "reservations.manage",
                    p_activity_id: activity.id
                }
            );

            if (rpcError) {
                console.error(
                    "[submit-reservation] notification recipient lookup failed:",
                    rpcError
                );
            } else {
                const userIds: string[] = Array.isArray(recipientIds)
                    ? (recipientIds as unknown[])
                          .map(v =>
                              typeof v === "string"
                                  ? v
                                  : v && typeof v === "object" && "user_id" in v
                                      ? String((v as { user_id: unknown }).user_id)
                                      : ""
                          )
                          .filter(v => v.length > 0)
                    : [];

                if (userIds.length === 0) {
                    console.log(
                        `[submit-reservation] no notification recipients (reservation_id=${reservationId}, activity_id=${activity.id}).`
                    );
                } else {
                    const dateIt = formatDateIt(reservationDate);
                    const timeIt = formatTimeIt(reservationTime);
                    const message = `${customerName} · ${dateIt} ${timeIt} · ${partySize} p.`;
                    const data = {
                        reservation_id: reservationId,
                        activity_id: activity.id,
                        activity_name: activity.name,
                        customer_name: customerName,
                        customer_email: customerEmail,
                        customer_phone: customerPhone,
                        reservation_date: reservationDate,
                        reservation_time: reservationTime,
                        party_size: partySize,
                        source: "online"
                    };

                    // Auto-confirmed → dedicated event_type + label so the
                    // bell + the dashboard deep-link can branch if needed.
                    // Fan-out destinations and message body are identical.
                    const eventType = isAutoConfirmed
                        ? "reservation.auto_confirmed"
                        : "reservation.new";
                    const notificationTitle = isAutoConfirmed
                        ? "Prenotazione confermata (auto)"
                        : "Nuova prenotazione";

                    const rows = userIds.map(uid => ({
                        user_id: uid,
                        tenant_id: activity.tenant_id,
                        event_type: eventType,
                        type: "info",
                        title: notificationTitle,
                        message,
                        data
                    }));

                    const { error: insertNotifError } = await supabase
                        .from("notifications")
                        .insert(rows);

                    if (insertNotifError) {
                        console.error(
                            "[submit-reservation] notification fan-out insert failed:",
                            insertNotifError
                        );
                    } else {
                        console.log(
                            `[submit-reservation] notification fan-out (reservation_id=${reservationId}, count=${rows.length}).`
                        );
                    }
                }
            }
        } catch (notifErr) {
            console.error("[submit-reservation] notification fan-out failed:", notifErr);
        }

        // The client renders different success copy based on `status`:
        //   'confirmed' → "Prenotazione confermata!" + Confermata pill
        //   'pending'   → "Richiesta inviata!" + In attesa pill
        return jsonResponse(
            { success: true, reservation_id: reservationId, status: placementStatus },
            200
        );
    } catch (err) {
        console.error("[submit-reservation] error:", err);
        return errorResponse("SERVER_ERROR", 500);
    }
});
