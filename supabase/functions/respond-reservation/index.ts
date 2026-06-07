// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";
import { COMPANY, getEmailFooterHtml, getEmailFooterText } from "../_shared/company-config.ts";

// =============================================================================
// respond-reservation
// =============================================================================
//
// Authenticated POST endpoint. An admin (a member of the venue's tenant with
// `reservations.manage` permission scoped to the reservation's activity)
// confirms / declines / cancels a pending reservation. The state transition
// runs under the caller's JWT through a user-scoped Supabase client, so the
// RLS policy `Roles can update reservations` is the SINGLE gate.
//
// No service_role is used to bypass auth. If the caller lacks the permission
// the UPDATE returns 0 rows and the function answers 404 — same response as
// "reservation not found" to avoid leaking authorization state.
//
// On a successful state transition the function fires (best-effort) an email
// to the customer with the outcome. Email failure never fails the state
// transition: the row is already updated.
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

// --- Validation / formatting helpers (mirrored from submit-reservation) ------

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDateIt(isoDate: string): string {
    const [y, m, d] = isoDate.split("-").map(n => parseInt(n, 10));
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    return new Intl.DateTimeFormat("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(dt);
}

function formatTimeIt(time: string): string {
    return time.slice(0, 5);
}

function reservationOutcomeReason(activityName: string): string {
    return `Hai ricevuto questa email perché hai richiesto una prenotazione presso ${activityName} tramite CataloGlobe.`;
}

function extractBearerJwt(req: Request): string | null {
    const h = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!h || !h.toLowerCase().startsWith("bearer ")) return null;
    const jwt = h.slice(7).trim();
    return jwt.length > 0 ? jwt : null;
}

// --- Action → target status table -------------------------------------------

type Action = "confirm" | "decline" | "cancel";
type ReservationStatus = "pending" | "confirmed" | "declined" | "cancelled";

const ACTION_TO_STATUS: Record<Action, ReservationStatus> = {
    confirm: "confirmed",
    decline: "declined",
    cancel:  "cancelled"
};

// Precondition on current status for each action. Prevents duplicate outcome
// emails and backwards/sideways transitions (e.g. confirming a cancelled row).
const ACTION_EXPECTS: Record<Action, ReservationStatus> = {
    confirm: "pending",
    decline: "pending",
    cancel:  "confirmed"
};

// --- Email builder ----------------------------------------------------------

interface OutcomeEmailArgs {
    activityName: string;
    customerName: string;
    reservationDate: string;
    reservationTime: string;
    partySize: number;
    action: Action;
}

function buildOutcomeEmail(args: OutcomeEmailArgs): { subject: string; html: string; text: string } {
    const { activityName, customerName, reservationDate, reservationTime, partySize, action } = args;

    const eActivityName = escapeHtml(activityName);
    const eCustomerName = escapeHtml(customerName);
    const dateIt = formatDateIt(reservationDate);
    const timeIt = formatTimeIt(reservationTime);
    const eDate = escapeHtml(dateIt);
    const eTime = escapeHtml(timeIt);

    const titles: Record<Action, string> = {
        confirm: "Prenotazione confermata",
        decline: "Prenotazione non confermata",
        cancel:  "Prenotazione annullata"
    };
    const bodies: Record<Action, { html: string; text: string }> = {
        confirm: {
            html: `Buone notizie! La tua richiesta di prenotazione presso <strong>${eActivityName}</strong> è stata <strong>confermata</strong>. Ti aspettiamo.`,
            text: `Buone notizie! La tua richiesta di prenotazione presso ${activityName} è stata confermata. Ti aspettiamo.`
        },
        decline: {
            html: `Ci dispiace, la tua richiesta di prenotazione presso <strong>${eActivityName}</strong> <strong>non è stata confermata</strong>. Puoi provare con una data o un orario diverso.`,
            text: `Ci dispiace, la tua richiesta di prenotazione presso ${activityName} non è stata confermata. Puoi provare con una data o un orario diverso.`
        },
        cancel: {
            html: `La tua prenotazione presso <strong>${eActivityName}</strong> è stata <strong>annullata</strong>. Se ritieni che ci sia stato un errore, contatta direttamente la sede.`,
            text: `La tua prenotazione presso ${activityName} è stata annullata. Se ritieni che ci sia stato un errore, contatta direttamente la sede.`
        }
    };

    const subject = `${titles[action]} — ${activityName}`;
    const reason = reservationOutcomeReason(activityName);

    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:40px">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
        <h1 style="margin:0 0 16px;font-size:22px;color:#111827">${titles[action]}</h1>
        <p style="margin:0 0 8px;font-size:15px;color:#374151">Ciao ${eCustomerName},</p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">${bodies[action].html}</p>
        <div style="margin:0 0 24px;padding:16px;background:#f3f4f6;border-radius:8px">
            <p style="margin:0 0 4px;font-size:13px;color:#6b7280">Dettagli</p>
            <p style="margin:0;font-size:15px;color:#111827"><strong>Data:</strong> ${eDate}</p>
            <p style="margin:0;font-size:15px;color:#111827"><strong>Ora:</strong> ${eTime}</p>
            <p style="margin:0;font-size:15px;color:#111827"><strong>Persone:</strong> ${partySize}</p>
        </div>
        ${getEmailFooterHtml(reason)}
    </div>
</div>`;
    const text =
        `Ciao ${customerName},\n\n` +
        `${bodies[action].text}\n\n` +
        `Dettagli\n` +
        `Data: ${dateIt}\n` +
        `Ora: ${timeIt}\n` +
        `Persone: ${partySize}\n\n` +
        `${getEmailFooterText(reason)}`;
    return { subject, html, text };
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

    const action = typeof body.action === "string" ? body.action.trim() : "";
    if (action !== "confirm" && action !== "decline" && action !== "cancel") {
        return errorResponse(req, "INVALID_ACTION", 400);
    }
    const newStatus = ACTION_TO_STATUS[action as Action];

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
        const expectedFrom = ACTION_EXPECTS[action as Action];

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

        // ── Outcome email (best-effort) ─────────────────────────────
        try {
            const email = buildOutcomeEmail({
                activityName,
                customerName: updated.customer_name as string,
                reservationDate: updated.reservation_date as string,
                reservationTime: updated.reservation_time as string,
                partySize: updated.party_size as number,
                action: action as Action
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
