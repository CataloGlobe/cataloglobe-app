// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";
import { COMPANY } from "../_shared/company-config.ts";
import {
    buildReservationConfirmedEmail,
    buildReservationOutcomeEmail,
    type ReservationEmailContent
} from "../_shared/reservationEmails.ts";
import {
    ACTION_EXPECTS,
    ACTION_TO_STATUS,
    isReservationAction,
    sendsCustomerEmail,
    type ReservationAction,
    type ReservationEmailAction
} from "../_shared/reservationTransitions.ts";

// =============================================================================
// respond-reservation
// =============================================================================
//
// Authenticated POST endpoint. An admin (a member of the venue's tenant with
// `reservations.manage` permission scoped to the reservation's activity)
// confirms / declines / cancels a reservation, or flags it as a no-show
// (and undoes that flag). The state machine lives in
// `_shared/reservationTransitions.ts`. The state transition
// runs under the caller's JWT through a user-scoped Supabase client, so the
// RLS policy `Roles can update reservations` is the SINGLE gate.
//
// No service_role is used to bypass auth. If the caller lacks the permission
// the UPDATE returns 0 rows and the function answers 404 — same response as
// "reservation not found" to avoid leaking authorization state.
//
// On a successful state transition the function fires (best-effort) an email
// to the customer with the outcome — EXCEPT for the no-show pair, which is
// silent by design (see `sendsCustomerEmail`). Email failure never fails the
// state transition: the row is already updated.
// =============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

// Allowlist mirrors stripe-checkout / stripe-update-seats (admin-only entry
// points). `respond-reservation` is dashboard-only: no public/preview origin
// expected. Browser blocks the response when Origin isn't echoed back.
const ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://staging.cataloglobe.com",
    "https://cataloglobe.com",
    "https://www.cataloglobe.com"
];

function corsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get("origin") ?? "";
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "";
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin"
    };
}

const ERROR_MESSAGES: Record<string, string> = {
    METHOD_NOT_ALLOWED:      "Metodo non consentito",
    UNAUTHORIZED:            "Autenticazione richiesta",
    INVALID_PAYLOAD:         "Dati non validi",
    INVALID_ACTION:          "Azione non valida",
    RESERVATION_NOT_FOUND:   "Prenotazione non trovata o permessi insufficienti",
    INVALID_TRANSITION:      "Transizione di stato non valida",
    SERVER_ERROR:            "Errore durante l'elaborazione della richiesta"
};

function errorResponse(req: Request, code: string, status: number, details?: Record<string, unknown>): Response {
    const message = ERROR_MESSAGES[code] ?? "Si è verificato un errore";
    return new Response(
        JSON.stringify({
            error_code: code,
            error: message,
            message,
            ...(details ? { details } : {})
        }),
        { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
}

function jsonResponse(req: Request, body: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" }
    });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractBearerJwt(req: Request): string | null {
    const h = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!h || !h.toLowerCase().startsWith("bearer ")) return null;
    const jwt = h.slice(7).trim();
    return jwt.length > 0 ? jwt : null;
}

// --- Email builder ----------------------------------------------------------

// Templates live in `_shared/reservationEmails.ts` (shared with
// submit-reservation). This wrapper only maps the admin action onto the right
// builder: `confirm` reuses the confirmation template with the "manual"
// variant (the diner DID send a request that sat in `pending`), while
// `decline` / `cancel` share the outcome template.
//
// The parameter type is `ReservationEmailAction`, NOT `ReservationAction`: the
// no-show pair is structurally unable to reach this function.
function buildActionEmail(args: {
    action: ReservationEmailAction;
    activityName: string;
    customerName: string;
    reservationDate: string;
    reservationTime: string;
    partySize: number;
}): ReservationEmailContent {
    const { action, ...rest } = args;
    if (action === "confirm") {
        return buildReservationConfirmedEmail({ ...rest, variant: "manual" });
    }
    return buildReservationOutcomeEmail({ ...rest, action });
}

// --- Handler ----------------------------------------------------------------

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders(req) });
    }
    if (req.method !== "POST") {
        return errorResponse(req, "METHOD_NOT_ALLOWED", 405);
    }

    // ── Auth ────────────────────────────────────────────────────────
    const jwt = extractBearerJwt(req);
    if (!jwt) {
        return errorResponse(req, "UNAUTHORIZED", 401);
    }

    // user-scoped client: anon key + caller JWT in Authorization header.
    // Subsequent queries run under the caller's role, so RLS gates everything.
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false }
    });

    // Validate JWT signature/expiry server-side. A failed getUser also catches
    // tampered or expired tokens before any DB round-trip.
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser(jwt);
    if (userErr || !userData?.user?.id) {
        return errorResponse(req, "UNAUTHORIZED", 401);
    }

    // ── Body validation ────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return errorResponse(req, "INVALID_PAYLOAD", 400);
    }

    const reservationId = typeof body.reservation_id === "string" ? body.reservation_id.trim() : "";
    if (!reservationId || !UUID_RE.test(reservationId)) {
        return errorResponse(req, "INVALID_PAYLOAD", 400, { field: "reservation_id" });
    }

    const rawAction = typeof body.action === "string" ? body.action.trim() : "";
    if (!isReservationAction(rawAction)) {
        return errorResponse(req, "INVALID_ACTION", 400);
    }
    const action: ReservationAction = rawAction;
    const newStatus = ACTION_TO_STATUS[action];

    // ── SELECT-then-UPDATE under user RLS ──────────────────────────
    // RLS policies on `reservations`:
    //   - SELECT gated by `reservations.read`
    //   - UPDATE gated by `reservations.manage`
    //
    // 1. SELECT first to distinguish 404 (row invisible) from 409
    //    (visible but wrong source state). Collapses
    //    "not found" and "no read permission" to 404 to avoid leaking
    //    authorization state.
    // 2. Status precondition check (server side) → 409 INVALID_TRANSITION
    //    with current_status in details.
    // 3. UPDATE with `.eq("status", expected)` as optimistic lock so a
    //    concurrent admin transitioning the same row can't race us into
    //    duplicate outcome emails.
    try {
        const expectedFrom = ACTION_EXPECTS[action];

        const { data: current, error: selectErr } = await supabaseUser
            .from("reservations")
            .select("id, status, activity_id")
            .eq("id", reservationId)
            .maybeSingle();

        if (selectErr) {
            console.error("[respond-reservation] select error:", selectErr);
            return errorResponse(req, "SERVER_ERROR", 500);
        }

        if (!current) {
            return errorResponse(req, "RESERVATION_NOT_FOUND", 404);
        }

        if (current.status !== expectedFrom) {
            return errorResponse(req, "INVALID_TRANSITION", 409, {
                current_status: current.status,
                expected_status: expectedFrom,
                action
            });
        }

        const { data: updated, error: updateErr } = await supabaseUser
            .from("reservations")
            .update({ status: newStatus })
            .eq("id", reservationId)
            .eq("status", expectedFrom)
            .select(
                "id, activity_id, customer_email, customer_name, reservation_date, reservation_time, party_size, status"
            )
            .maybeSingle();

        if (updateErr) {
            // RLS denials on UPDATE typically surface as 0 rows; a real error
            // here means DB/transport issue.
            console.error("[respond-reservation] update error:", updateErr);
            return errorResponse(req, "SERVER_ERROR", 500);
        }

        if (!updated) {
            // Either missing `reservations.manage` (row visible via SELECT but
            // not updatable) or a concurrent admin already transitioned the
            // row. We don't disclose which: the UI refetches and renders the
            // current state regardless.
            return errorResponse(req, "INVALID_TRANSITION", 409, {
                expected_status: expectedFrom,
                action
            });
        }

        // ── Outcome email (best-effort, and NOT for every action) ───
        // `sendsCustomerEmail` is the single gate. The no-show pair is silent
        // by design: nothing is built, nothing is sent, and the activity name
        // is not even looked up — there is no copy to put it in. Writing
        // "you did not show up" to a diner is aggressive and pointless.
        if (!sendsCustomerEmail(action)) {
            console.log(
                `[respond-reservation] silent transition (action=${action}, reservation_id=${updated.id}). No customer email.`
            );
        } else {
            // Resolve activity name (also under user RLS — read gated by
            // activity.read, granted to every role that has reservations.manage).
            let activityName = "la sede";
            const { data: activityRow, error: activityErr } = await supabaseUser
                .from("activities")
                .select("name")
                .eq("id", updated.activity_id)
                .maybeSingle();
            if (!activityErr && activityRow?.name) {
                activityName = activityRow.name as string;
            } else if (activityErr) {
                // Read denial → fall back to generic copy; do NOT fail the response.
                console.warn(
                    `[respond-reservation] activity read failed for ${updated.activity_id}:`,
                    activityErr
                );
            }

            try {
                const email = buildActionEmail({
                    activityName,
                    customerName: updated.customer_name as string,
                    reservationDate: updated.reservation_date as string,
                    reservationTime: updated.reservation_time as string,
                    partySize: updated.party_size as number,
                    // Narrowed by `sendsCustomerEmail`: the no-show pair cannot
                    // reach this branch.
                    action: action as ReservationEmailAction
                });
                await resend.emails.send({
                    from: COMPANY.email.sender,
                    reply_to: COMPANY.contact.support,
                    to: updated.customer_email as string,
                    subject: email.subject,
                    html: email.html,
                    text: email.text
                });
            } catch (mailErr) {
                console.error("[respond-reservation] outcome email failed:", mailErr);
            }
        }

        return jsonResponse(
            req,
            { success: true, reservation_id: updated.id, status: updated.status },
            200
        );
    } catch (err) {
        console.error("[respond-reservation] error:", err);
        return errorResponse(req, "SERVER_ERROR", 500);
    }
});
