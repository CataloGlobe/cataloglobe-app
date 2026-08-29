// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";
import { COMPANY } from "../_shared/company-config.ts";
import { formatDateIt, formatTimeIt } from "../_shared/emailFormat.ts";
import { buildReservationsDashboardUrl } from "../_shared/publicSiteUrl.ts";
import { resolveAlertRecipients } from "../_shared/reservationAlertRecipients.ts";
import { buildReservationCancelledByCustomerEmail } from "../_shared/reservationEmails.ts";
import {
    checkRateLimit,
    extractClientIp,
    hashIp,
    RateLimitExceededError
} from "../_shared/rateLimit.ts";
import {
    InvalidReservationTokenError,
    verifyReservationToken
} from "../_shared/reservationToken.ts";
import { evaluateCancellationWindow } from "../_shared/reservationCancellation.ts";
import { ACTION_EXPECTS, ACTION_TO_STATUS } from "../_shared/reservationTransitions.ts";

// =============================================================================
// cancel-reservation-public
// =============================================================================
//
// Public endpoint behind the signed cancellation link a diner receives by
// email. No login, no Supabase session: the token IS the authorization. It is
// verified here and the row is then touched with service_role — there is no
// anon RLS policy on `reservations` and there must not be one, so that what a
// customer may do lives in exactly one place.
//
// ── One function, two actions ───────────────────────────────────────────────
// `{ token, action: "read" | "cancel" }`. Two separate functions were the
// alternative and were rejected: read and cancel share the whole preamble —
// token verification, row fetch, activity resolution, cutoff evaluation — and
// the only difference is the final UPDATE. Splitting them would duplicate the
// cutoff computation across two deployables, and the cutoff is precisely the
// check that must never drift between the page and the write.
//
// ── read never writes ───────────────────────────────────────────────────────
// Email clients pre-fetch links to build previews, so a `read` MUST be
// side-effect free on the reservation: no counter, no last-seen timestamp,
// nothing. The single UPDATE in this file lives after `action === "cancel"`,
// and a test asserts there is exactly one and that it sits after that branch.
// (The one write a `read` does cause is the shared rate-limit bucket, which
// counts requests rather than reservation state. Its limits are set high
// enough that a preview fetch cannot lock the real diner out.)
//
// ── No oracle ───────────────────────────────────────────────────────────────
// A bad signature and a reservation that does not exist return the SAME code,
// the SAME message and the SAME status. Whoever holds a forged token learns
// nothing about which ids are real.
// =============================================================================

// Generous on read (mail previews, refreshes, someone re-opening the link),
// tight on cancel (a diner cancels a given booking once).
const RATE_LIMIT_READ_PER_TOKEN = 20;
const RATE_LIMIT_READ_WINDOW_SECONDS = 60;
const RATE_LIMIT_CANCEL_PER_TOKEN = 5;
const RATE_LIMIT_CANCEL_WINDOW_SECONDS = 300;
const RATE_LIMIT_IP_PER_HOUR = 60;
const RATE_LIMIT_IP_WINDOW_SECONDS = 3600;

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// IT user-facing error catalog. INVALID_LINK deliberately covers both "the
// signature does not check out" and "no such reservation": same code, same
// text, same status, so the two cases are indistinguishable from outside.
const ERROR_MESSAGES: Record<string, string> = {
    METHOD_NOT_ALLOWED:         "Metodo non consentito",
    INVALID_PAYLOAD:            "Dati non validi",
    INVALID_LINK:               "Link non valido o scaduto",
    CANCELLATION_WINDOW_CLOSED: "Non è più possibile annullare online",
    NOT_CANCELLABLE:            "Questa prenotazione non può essere annullata",
    RATE_LIMITED:               "Troppe richieste. Riprova più tardi.",
    SERVER_ERROR:               "Errore durante l'operazione"
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

function jsonResponse(body: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

/** SHA-256 hex, used to key rate-limit buckets without storing the raw token. */
async function hashToken(token: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Public phone of the venue, or null.
 *
 * `phone_public` is the venue's own decision about being reachable by diners;
 * an unlisted number stays unlisted even here, where showing it would be
 * convenient. The page has copy for the no-phone case.
 */
function publicPhoneOf(activity: { phone?: string | null; phone_public?: boolean | null }): string | null {
    if (activity.phone_public !== true) return null;
    const phone = typeof activity.phone === "string" ? activity.phone.trim() : "";
    return phone.length > 0 ? phone : null;
}

interface VenueNotificationArgs {
    reservationId: string;
    activity: {
        id: string;
        tenant_id: string;
        name: string;
        reservation_notification_emails: string[] | null;
    };
    customerName: string;
    reservationDate: string;
    reservationTime: string;
    partySize: number;
}

/**
 * Tells the venue that a diner cancelled: email to the alert recipients plus
 * an in-app notification to everyone with `reservations.manage` on the site.
 *
 * Same two channels, same recipients and same best-effort contract as the
 * new-booking alert in `submit-reservation` — a cancellation that only some of
 * them hear about would be worse than useless during service.
 *
 * Never throws. Every failure is logged; the caller has already committed the
 * cancellation and must return success regardless.
 */
async function notifyVenueOfCancellation(
    supabase: ReturnType<typeof createClient>,
    args: VenueNotificationArgs
): Promise<void> {
    const { reservationId, activity, customerName, reservationDate, reservationTime, partySize } =
        args;

    // Email agli stessi destinatari dell'avviso di nuova prenotazione.
    try {
        const recipients = await resolveAlertRecipients(
            supabase,
            {
                tenant_id: activity.tenant_id,
                reservation_notification_emails: activity.reservation_notification_emails
            },
            "cancel-reservation-public"
        );
        if (!recipients) {
            console.warn(
                `[cancel-reservation-public] no alert recipient resolvable (reservation_id=${reservationId}, activity_id=${activity.id}). Skipping email.`
            );
        } else {
            const emailBody = buildReservationCancelledByCustomerEmail({
                activityName: activity.name,
                customerName,
                reservationDate,
                reservationTime,
                partySize,
                dashboardUrl: buildReservationsDashboardUrl(activity.tenant_id)
            });
            const results = await Promise.allSettled(
                recipients.emails.map(to =>
                    resend.emails.send({
                        from: COMPANY.email.sender,
                        reply_to: COMPANY.contact.support,
                        to,
                        subject: emailBody.subject,
                        html: emailBody.html,
                        text: emailBody.text
                    })
                )
            );
            results.forEach((r, i) => {
                if (r.status === "rejected") {
                    console.error(
                        `[cancel-reservation-public] venue email failed for ${recipients.emails[i]}:`,
                        r.reason
                    );
                }
            });
        }
    } catch (mailErr) {
        console.error("[cancel-reservation-public] venue email step failed:", mailErr);
    }

    // Notifica in-app: stessa risoluzione destinatari di submit-reservation.
    try {
        const { data: recipientIds, error: rpcError } = await supabase.rpc(
            "get_users_with_activity_permission",
            { p_permission_id: "reservations.manage", p_activity_id: activity.id }
        );

        if (rpcError) {
            console.error(
                "[cancel-reservation-public] notification recipient lookup failed:",
                rpcError
            );
            return;
        }

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
                `[cancel-reservation-public] no notification recipients (reservation_id=${reservationId}, activity_id=${activity.id}).`
            );
            return;
        }

        const dateIt = formatDateIt(reservationDate);
        const timeIt = formatTimeIt(reservationTime);
        const rows = userIds.map(uid => ({
            user_id: uid,
            tenant_id: activity.tenant_id,
            event_type: "reservation.cancelled_by_customer",
            // `warning`, non `info`: un tavolo che si libera durante il
            // servizio è qualcosa su cui la sala deve agire, non una riga
            // da leggere con calma.
            type: "warning",
            title: "Prenotazione annullata dal cliente",
            message: `${customerName} · ${dateIt} ${timeIt} · ${partySize} p.`,
            data: {
                reservation_id: reservationId,
                activity_id: activity.id,
                activity_name: activity.name,
                customer_name: customerName,
                reservation_date: reservationDate,
                reservation_time: reservationTime,
                party_size: partySize,
                cancelled_by: "customer"
            }
        }));

        const { error: insertNotifError } = await supabase.from("notifications").insert(rows);
        if (insertNotifError) {
            console.error(
                "[cancel-reservation-public] notification fan-out insert failed:",
                insertNotifError
            );
        } else {
            console.log(
                `[cancel-reservation-public] notification fan-out (reservation_id=${reservationId}, count=${rows.length}).`
            );
        }
    } catch (notifErr) {
        console.error("[cancel-reservation-public] notification fan-out failed:", notifErr);
    }
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
        return errorResponse("METHOD_NOT_ALLOWED", 405);
    }

    try {
        let body: Record<string, unknown>;
        try {
            body = (await req.json()) as Record<string, unknown>;
        } catch {
            return errorResponse("INVALID_PAYLOAD", 400);
        }

        const rawToken = typeof body.token === "string" ? body.token.trim() : "";
        const action = body.action === "cancel" ? "cancel" : body.action === "read" ? "read" : null;
        if (action === null) {
            return errorResponse("INVALID_PAYLOAD", 400, { field: "action" });
        }
        if (rawToken.length === 0) {
            // Structurally absent token: same answer as a forged one.
            return errorResponse("INVALID_LINK", 404);
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // ── Rate limit, BEFORE verifying the token ─────────────────────
        // Order matters: verifying first would leave signature guessing
        // unmetered. The IP bucket is what actually bounds brute force (an
        // attacker can mint a fresh token string, but not a fresh IP as
        // cheaply); the per-token bucket bounds hammering of one real link.
        // Fail-closed, like every other public endpoint here.
        const clientIpHash = await hashIp(extractClientIp(req));
        const tokenHash = await hashToken(rawToken);
        try {
            await checkRateLimit(supabase, {
                key: `cancel-reservation-public:ip:${clientIpHash}`,
                limit: RATE_LIMIT_IP_PER_HOUR,
                windowSeconds: RATE_LIMIT_IP_WINDOW_SECONDS
            });
            await checkRateLimit(supabase, {
                key: `cancel-reservation-public:${action}:token:${tokenHash}`,
                limit: action === "cancel" ? RATE_LIMIT_CANCEL_PER_TOKEN : RATE_LIMIT_READ_PER_TOKEN,
                windowSeconds:
                    action === "cancel"
                        ? RATE_LIMIT_CANCEL_WINDOW_SECONDS
                        : RATE_LIMIT_READ_WINDOW_SECONDS
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

        // ── Token ──────────────────────────────────────────────────────
        let reservationId: string;
        try {
            // "cancel" esplicito: un token di conferma presenza non deve
            // annullare nulla, nemmeno se qualcuno lo incolla qui.
            ({ reservationId } = await verifyReservationToken(rawToken, "cancel"));
        } catch (tokenErr) {
            if (tokenErr instanceof InvalidReservationTokenError) {
                // Reason logged, never returned.
                console.warn(`[cancel-reservation-public] rejected token: ${tokenErr.message}`);
                return errorResponse("INVALID_LINK", 404);
            }
            // Missing secret and friends: a deployment fault, not a bad link.
            throw tokenErr;
        }

        // ── Reservation + venue ────────────────────────────────────────
        // Read with service_role: there is no anon policy to lean on. The
        // token is the authorization and it has just been verified.
        const { data: reservation, error: selectErr } = await supabase
            .from("reservations")
            .select(
                "id, status, reservation_date, reservation_time, party_size, customer_name, " +
                "activity:activities!inner(id, tenant_id, name, slug, phone, phone_public, " +
                "reservation_cancellation_cutoff_minutes, reservation_notification_emails)"
            )
            .eq("id", reservationId)
            .maybeSingle();

        if (selectErr) {
            console.error("[cancel-reservation-public] select error:", selectErr);
            return errorResponse("SERVER_ERROR", 500);
        }
        if (!reservation) {
            // Same code, same message, same status as a bad signature above.
            // A valid signature over a non-existent id must not confirm that
            // the id is non-existent.
            return errorResponse("INVALID_LINK", 404);
        }

        const activity = reservation.activity as {
            id: string;
            tenant_id: string;
            name: string;
            slug: string | null;
            phone: string | null;
            phone_public: boolean | null;
            reservation_cancellation_cutoff_minutes: number | null;
            reservation_notification_emails: string[] | null;
        };

        // ── Cutoff, computed from the DB row ───────────────────────────
        // Always recomputed here, for BOTH actions, from the stored date/time
        // and the venue's own cutoff. Nothing the client sends takes part in
        // this: a `can_cancel` handed back from a previous `read` is a hint
        // for rendering, never an input to the decision.
        const window = evaluateCancellationWindow({
            reservationDate: reservation.reservation_date,
            reservationTime: reservation.reservation_time,
            cutoffMinutes: activity.reservation_cancellation_cutoff_minutes,
            now: new Date()
        });

        const isCancellable =
            (ACTION_EXPECTS.cancel_by_customer as readonly string[]).includes(reservation.status);
        const canCancel = isCancellable && window.allowed;
        const venuePhone = publicPhoneOf(activity);

        // The summary shown to the diner. Deliberately narrow: no notes (they
        // may carry the venue's internal remarks), no email or phone of the
        // customer, no tenant_id / activity_id / table_id, no timestamps.
        const summary = {
            venue_name: activity.name,
            reservation_date: reservation.reservation_date,
            reservation_time: reservation.reservation_time,
            party_size: reservation.party_size,
            customer_name: reservation.customer_name,
            status: reservation.status,
            can_cancel: canCancel,
            cutoff_minutes: window.cutoffMinutes,
            // Only when the diner cannot self-serve: that is the one moment
            // the number is actionable, and it keeps the payload minimal
            // otherwise.
            venue_phone: canCancel ? null : venuePhone
        };

        if (action === "read") {
            return jsonResponse({ success: true, reservation: summary }, 200);
        }

        // ── action === "cancel" ────────────────────────────────────────

        // Already cancelled: idempotent success, not an error. Double clicks,
        // a second tap on the email link and a browser back-then-forward all
        // land here, and none of them is a failure worth showing.
        if (reservation.status === "cancelled") {
            return jsonResponse(
                { success: true, status: "cancelled", already_cancelled: true, reservation: summary },
                200
            );
        }

        if (!isCancellable) {
            return errorResponse("NOT_CANCELLABLE", 409, {
                current_status: reservation.status
            });
        }

        if (!window.allowed) {
            return errorResponse("CANCELLATION_WINDOW_CLOSED", 409, {
                cutoff_minutes: window.cutoffMinutes,
                venue_phone: venuePhone
            });
        }

        // Compare-and-set on the accepted source states: a venue confirming or
        // declining at the same moment must not be overwritten silently.
        const { data: updated, error: updateErr } = await supabase
            .from("reservations")
            .update({ status: ACTION_TO_STATUS.cancel_by_customer })
            .eq("id", reservationId)
            .in("status", ACTION_EXPECTS.cancel_by_customer)
            .select("id, status")
            .maybeSingle();

        if (updateErr) {
            console.error("[cancel-reservation-public] update error:", updateErr);
            return errorResponse("SERVER_ERROR", 500);
        }
        if (!updated) {
            // Someone moved the row between the SELECT and the UPDATE.
            return errorResponse("NOT_CANCELLABLE", 409);
        }

        console.log(
            `[cancel-reservation-public] reservation ${updated.id} cancelled by customer.`
        );

        // ── Avviso alla sede ───────────────────────────────────────────
        // La pagina dice al cliente "Abbiamo avvisato la sede", e quella
        // frase deve essere vera. Due canali, entrambi tentati, entrambi
        // best-effort: il tavolo è già libero e la disdetta è già scritta,
        // quindi un guasto di Resend non deve trasformarsi in un errore
        // mostrato a chi ha appena fatto la cosa giusta.
        //
        // Vale solo per l'annullamento appena avvenuto: il ramo idempotente
        // sopra ritorna prima, perché la sede era già stata avvisata la
        // prima volta e un secondo click non è una seconda notizia.
        await notifyVenueOfCancellation(supabase, {
            reservationId: updated.id as string,
            activity,
            customerName: reservation.customer_name as string,
            reservationDate: reservation.reservation_date as string,
            reservationTime: reservation.reservation_time as string,
            partySize: reservation.party_size as number
        });

        return jsonResponse(
            {
                success: true,
                status: updated.status,
                already_cancelled: false,
                reservation: { ...summary, status: updated.status, can_cancel: false }
            },
            200
        );
    } catch (err) {
        console.error("[cancel-reservation-public] unhandled error:", err);
        return errorResponse("SERVER_ERROR", 500);
    }
});
