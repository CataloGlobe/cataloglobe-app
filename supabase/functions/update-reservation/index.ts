// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";
import { COMPANY } from "../_shared/company-config.ts";
import { buildReservationUpdatedEmail } from "../_shared/reservationEmails.ts";
import { buildReservationCancelUrl } from "../_shared/publicSiteUrl.ts";
import { buildReservationIcsAttachment } from "../_shared/reservationIcs.ts";
import { signReservationToken } from "../_shared/reservationToken.ts";
import { normalizePhoneToE164 } from "../_shared/phoneNormalize.ts";
import { decideMoveNotification } from "../_shared/reservationUpdate.ts";

// =============================================================================
// update-reservation
// =============================================================================
//
// Authenticated POST endpoint. L'operatore modifica i DATI di una
// prenotazione (data, ora, coperti, contatti, note). Lo status NON passa da
// qui: le transizioni restano sotto `respond-reservation`.
//
// Fino alla FASE 4.2 questa scrittura era un UPDATE diretto dal frontend
// sotto RLS (`updateReservation` in src/services/supabase/reservations.ts).
// Vive qui perche' una modifica di data o ora deve produrre un artefatto in
// uscita — la mail «Prenotazione spostata» con l'.ics aggiornato — e le mail
// partono solo dalle Edge.
//
// ── Il permesso e' quello di prima, ne' piu' ne' meno ───────────────────────
// SELECT e UPDATE girano sotto il JWT del chiamante attraverso un client
// user-scoped: la policy RLS `Roles can update reservations`
// (`has_permission('reservations.manage', activity_id)`, USING + WITH CHECK)
// e' l'UNICO gate, esattamente come quando l'UPDATE partiva dal browser.
// Nessun service_role. Se il chiamante non ha il permesso, l'UPDATE tocca 0
// righe e la funzione risponde PERMISSION_DENIED — lo stesso esito che il
// frontend riceveva prima (0 righe → "Prenotazione non trovata").
//
// ── Nessuna validazione nuova ───────────────────────────────────────────────
// Il vincolo chiude il canale online, mai l'operatore. Orari, griglia,
// preavviso e orizzonte (`isReservationTimeBookable`, FASE 4.1) NON passano
// di qui: l'operatore puo' spostare una prenotazione alle 4 del mattino di un
// giorno di chiusura, come poteva prima. Qui si controlla solo la FORMA dei
// campi (tipo, lunghezza), come faceva il form.
//
// ── La mail ─────────────────────────────────────────────────────────────────
// Parte da sola quando cambiano data o ora, e per nient'altro
// (`decideMoveNotification`, _shared/reservationUpdate.ts). Il SEQUENCE
// dell'.ics lo incrementa il trigger `reservations_bump_ics_sequence` nella
// stessa transazione dell'UPDATE: qui si rilegge la riga e si emette. Un
// fallimento della mail non fallisce mai la modifica: la riga e' gia' scritta.
// =============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

// Dashboard-only, come respond-reservation.
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
    METHOD_NOT_ALLOWED:    "Metodo non consentito",
    UNAUTHORIZED:          "Autenticazione richiesta",
    INVALID_PAYLOAD:       "Dati non validi",
    RESERVATION_NOT_FOUND: "Prenotazione non trovata",
    PERMISSION_DENIED:     "Permesso negato. Non puoi gestire prenotazioni su questa sede.",
    SERVER_ERROR:          "Errore durante il salvataggio della prenotazione"
};

function errorResponse(req: Request, code: string, status: number, details?: Record<string, unknown>): Response {
    const message = ERROR_MESSAGES[code] ?? "Si è verificato un errore";
    return new Response(
        JSON.stringify({ error_code: code, error: message, message, ...(details ? { details } : {}) }),
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
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

function extractBearerJwt(req: Request): string | null {
    const h = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!h || !h.toLowerCase().startsWith("bearer ")) return null;
    const jwt = h.slice(7).trim();
    return jwt.length > 0 ? jwt : null;
}

// Le stesse colonne che il frontend riceveva da `.select("*")`: la risposta
// sostituisce quella riga uno a uno.
const RESERVATION_COLUMNS = "*";

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
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser(jwt);
    if (userErr || !userData?.user?.id) {
        return errorResponse(req, "UNAUTHORIZED", 401);
    }

    // ── Body: solo la FORMA, come il form ───────────────────────────
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
    // Filtro difensivo oltre la RLS, come `.eq("tenant_id")` nel service.
    const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
    if (!tenantId || !UUID_RE.test(tenantId)) {
        return errorResponse(req, "INVALID_PAYLOAD", 400, { field: "tenant_id" });
    }

    const reservationDate = typeof body.reservation_date === "string" ? body.reservation_date.trim() : "";
    if (!DATE_RE.test(reservationDate)) {
        return errorResponse(req, "INVALID_PAYLOAD", 400, { field: "reservation_date" });
    }
    const reservationTime = typeof body.reservation_time === "string" ? body.reservation_time.trim() : "";
    if (!TIME_RE.test(reservationTime)) {
        return errorResponse(req, "INVALID_PAYLOAD", 400, { field: "reservation_time" });
    }
    const partySize = body.party_size;
    if (typeof partySize !== "number" || !Number.isInteger(partySize) || partySize <= 0) {
        return errorResponse(req, "INVALID_PAYLOAD", 400, { field: "party_size" });
    }
    const customerName = typeof body.customer_name === "string" ? body.customer_name.trim() : "";
    if (!customerName || customerName.length > 200) {
        return errorResponse(req, "INVALID_PAYLOAD", 400, { field: "customer_name" });
    }
    const customerPhone = typeof body.customer_phone === "string" ? body.customer_phone.trim() : "";
    if (!customerPhone || customerPhone.length > 50) {
        return errorResponse(req, "INVALID_PAYLOAD", 400, { field: "customer_phone" });
    }
    // Facoltativa: stringa vuota = nessun indirizzo, come nel form admin.
    const customerEmail = typeof body.customer_email === "string" ? body.customer_email.trim() : "";
    if (customerEmail.length > 320) {
        return errorResponse(req, "INVALID_PAYLOAD", 400, { field: "customer_email" });
    }
    let notes: string | null = null;
    if (body.notes !== undefined && body.notes !== null) {
        if (typeof body.notes !== "string" || body.notes.trim().length > 500) {
            return errorResponse(req, "INVALID_PAYLOAD", 400, { field: "notes" });
        }
        notes = body.notes.trim().length > 0 ? body.notes.trim() : null;
    }

    try {
        // ── Stato precedente, sotto RLS (reservations.read) ─────────
        const { data: before, error: selectErr } = await supabaseUser
            .from("reservations")
            .select("id, activity_id, status, reservation_date, reservation_time, customer_email")
            .eq("id", reservationId)
            .eq("tenant_id", tenantId)
            .maybeSingle();
        if (selectErr) {
            console.error("[update-reservation] select error:", selectErr);
            return errorResponse(req, "SERVER_ERROR", 500);
        }
        if (!before) {
            return errorResponse(req, "RESERVATION_NOT_FOUND", 404);
        }

        // ── UPDATE, sotto RLS (reservations.manage) ──────────────────
        // Il trigger `reservations_bump_ics_sequence` incrementa
        // `ics_sequence` nella stessa transazione se data o ora cambiano;
        // `.select()` rilegge la riga com'e' dopo i trigger.
        const { data: updated, error: updateErr } = await supabaseUser
            .from("reservations")
            .update({
                reservation_date: reservationDate,
                reservation_time: reservationTime,
                party_size: partySize,
                customer_name: customerName,
                customer_email: customerEmail,
                customer_phone: customerPhone,
                // Ricalcolata a ogni edit: il grezzo puo' cambiare, la
                // canonica deve seguirlo (o tornare null).
                customer_phone_e164: normalizePhoneToE164(customerPhone),
                notes,
                updated_at: new Date().toISOString()
            })
            .eq("id", reservationId)
            .eq("tenant_id", tenantId)
            .select(RESERVATION_COLUMNS)
            .maybeSingle();
        if (updateErr) {
            console.error("[update-reservation] update error:", updateErr);
            return errorResponse(req, "SERVER_ERROR", 500);
        }
        if (!updated) {
            // Riga visibile (SELECT ok) ma non aggiornabile: manca
            // `reservations.manage`. Prima della Edge questo era un UPDATE a
            // 0 righe dal browser.
            return errorResponse(req, "PERMISSION_DENIED", 403);
        }

        // ── La mail, solo se data o ora sono cambiate ────────────────
        const decision = decideMoveNotification(before, {
            reservation_date: updated.reservation_date as string,
            reservation_time: updated.reservation_time as string,
            status: updated.status as string,
            customer_email: (updated.customer_email as string | null) ?? null
        });

        if (!decision.notify) {
            console.log(
                `[update-reservation] no customer email (reason=${decision.reason}, reservation_id=${updated.id}).`
            );
        } else {
            try {
                // Sede, sotto RLS: chi ha reservations.manage ha activity.read.
                let activityName = "la sede";
                let activitySlug: string | null = null;
                let activityRowForIcs: Record<string, unknown> | null = null;
                const { data: activityRow, error: activityErr } = await supabaseUser
                    .from("activities")
                    .select(
                        "name, slug, reservation_duration_minutes, " +
                        "address, street_number, postal_code, city, province"
                    )
                    .eq("id", updated.activity_id)
                    .maybeSingle();
                if (!activityErr && activityRow?.name) {
                    activityName = activityRow.name as string;
                    activitySlug = (activityRow.slug as string | null) ?? null;
                    activityRowForIcs = activityRow as Record<string, unknown>;
                } else if (activityErr) {
                    console.warn(
                        `[update-reservation] activity read failed for ${updated.activity_id}:`,
                        activityErr
                    );
                }

                // Link di disdetta: un orario nuovo puo' non andare bene.
                let cancelUrl: string | null = null;
                if (activitySlug) {
                    try {
                        cancelUrl = buildReservationCancelUrl(
                            activitySlug,
                            await signReservationToken(updated.id as string)
                        );
                    } catch (tokenErr) {
                        console.error(
                            `[update-reservation] cancellation token minting failed (reservation_id=${updated.id}):`,
                            tokenErr instanceof Error ? tokenErr.message : "unknown error"
                        );
                    }
                }

                const language = (updated.customer_language as string | null) ?? null;
                const email = buildReservationUpdatedEmail({
                    activityName,
                    customerName: updated.customer_name as string,
                    reservationDate: updated.reservation_date as string,
                    reservationTime: updated.reservation_time as string,
                    partySize: updated.party_size as number,
                    previousDate: before.reservation_date as string,
                    previousTime: before.reservation_time as string,
                    cancelUrl,
                    language
                });
                // Stesso UID della conferma, SEQUENCE nuovo: il calendario
                // SPOSTA l'evento, non lo duplica.
                const attachments = activityRowForIcs
                    ? buildReservationIcsAttachment({
                          reservationId: updated.id as string,
                          venueName: activityName,
                          reservationDate: updated.reservation_date as string,
                          reservationTime: updated.reservation_time as string,
                          partySize: updated.party_size as number,
                          durationMinutes: activityRowForIcs.reservation_duration_minutes as number | null,
                          address: activityRowForIcs,
                          cancelUrl,
                          language,
                          icsSequence: updated.ics_sequence as number,
                          now: new Date()
                      })
                    : undefined;

                await resend.emails.send({
                    from: COMPANY.email.sender,
                    reply_to: COMPANY.contact.support,
                    to: updated.customer_email as string,
                    subject: email.subject,
                    html: email.html,
                    text: email.text,
                    ...(attachments ? { attachments } : {})
                });
                console.log(
                    `[update-reservation] moved email sent (reservation_id=${updated.id}, ics_sequence=${updated.ics_sequence}).`
                );
            } catch (mailErr) {
                console.error("[update-reservation] moved email failed:", mailErr);
            }
        }

        return jsonResponse(req, { success: true, reservation: updated }, 200);
    } catch (err) {
        console.error("[update-reservation] error:", err);
        return errorResponse(req, "SERVER_ERROR", 500);
    }
});
