// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

// =============================================================================
// confirm-reservation-attendance
// =============================================================================
//
// Endpoint pubblico dietro il pulsante "confermo che vengo" del promemoria
// della sera prima. Nessun login: il token firmato E' l'autorizzazione, e porta
// il claim `act = "confirm"`. Un token di disdetta non arriva qui, e questo non
// arriva alla disdetta: i due link stanno uno sotto l'altro nella stessa
// email, ed e' esattamente il caso in cui una confusione sarebbe silenziosa.
//
// ── Non cambia lo stato ─────────────────────────────────────────────────────
// La prenotazione resta `confirmed`. L'unica scrittura e' `guest_confirmed_at`.
// La conferma del cliente non e' una transizione della macchina a stati: e' un
// segnale operativo che si affianca allo stato, e mescolare le due cose
// significherebbe dover inventare uno stato "confermata due volte" che non
// vuole dire niente.
//
// ── Idempotente ─────────────────────────────────────────────────────────────
// L'UPDATE ha `.is("guest_confirmed_at", null)`: la seconda pressione non
// sovrascrive il timestamp originale e non e' un errore. Chi ripreme vede la
// stessa schermata di conferma, con l'ora della PRIMA volta — che e' il dato
// vero, e quello che serve alla sala.
//
// ── Nessun oracolo ──────────────────────────────────────────────────────────
// Firma non valida, act sbagliato e prenotazione inesistente restituiscono lo
// stesso codice, lo stesso testo e lo stesso stato, come in
// `cancel-reservation-public`.
// =============================================================================

const RATE_LIMIT_READ_PER_TOKEN = 20;
const RATE_LIMIT_READ_WINDOW_SECONDS = 60;
const RATE_LIMIT_CONFIRM_PER_TOKEN = 5;
const RATE_LIMIT_CONFIRM_WINDOW_SECONDS = 300;
const RATE_LIMIT_IP_PER_HOUR = 60;
const RATE_LIMIT_IP_WINDOW_SECONDS = 3600;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const ERROR_MESSAGES: Record<string, string> = {
    METHOD_NOT_ALLOWED: "Metodo non consentito",
    INVALID_PAYLOAD:    "Dati non validi",
    INVALID_LINK:       "Link non valido o scaduto",
    NOT_CONFIRMABLE:    "Questa prenotazione non può essere confermata",
    RATE_LIMITED:       "Troppe richieste. Riprova più tardi.",
    SERVER_ERROR:       "Errore durante l'operazione"
};

function errorResponse(
    code: string,
    status: number,
    details?: Record<string, unknown>,
    extraHeaders?: Record<string, string>
): Response {
    const message = ERROR_MESSAGES[code] ?? "Si è verificato un errore";
    return new Response(
        JSON.stringify({ error_code: code, error: message, message, ...(details ? { details } : {}) }),
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

async function hashToken(token: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

Deno.serve(async (req: Request) => {
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
        const action =
            body.action === "confirm" ? "confirm" : body.action === "read" ? "read" : null;
        if (action === null) {
            return errorResponse("INVALID_PAYLOAD", 400, { field: "action" });
        }
        if (rawToken.length === 0) {
            return errorResponse("INVALID_LINK", 404);
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // Rate limit prima della verifica del token: verificare per primo
        // lascerebbe non contato il tentativo di indovinare una firma.
        const clientIpHash = await hashIp(extractClientIp(req));
        const tokenHash = await hashToken(rawToken);
        try {
            await checkRateLimit(supabase, {
                key: `confirm-reservation-attendance:ip:${clientIpHash}`,
                limit: RATE_LIMIT_IP_PER_HOUR,
                windowSeconds: RATE_LIMIT_IP_WINDOW_SECONDS
            });
            await checkRateLimit(supabase, {
                key: `confirm-reservation-attendance:${action}:token:${tokenHash}`,
                limit:
                    action === "confirm"
                        ? RATE_LIMIT_CONFIRM_PER_TOKEN
                        : RATE_LIMIT_READ_PER_TOKEN,
                windowSeconds:
                    action === "confirm"
                        ? RATE_LIMIT_CONFIRM_WINDOW_SECONDS
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

        // "confirm" esplicito: un token di disdetta non conferma nulla.
        let reservationId: string;
        try {
            ({ reservationId } = await verifyReservationToken(rawToken, "confirm"));
        } catch (tokenErr) {
            if (tokenErr instanceof InvalidReservationTokenError) {
                console.warn(`[confirm-reservation-attendance] rejected token: ${tokenErr.message}`);
                return errorResponse("INVALID_LINK", 404);
            }
            throw tokenErr;
        }

        const { data: reservation, error: selectErr } = await supabase
            .from("reservations")
            .select(
                "id, status, reservation_date, reservation_time, party_size, customer_name, " +
                "guest_confirmed_at, activity:activities!inner(name)"
            )
            .eq("id", reservationId)
            .maybeSingle();

        if (selectErr) {
            console.error("[confirm-reservation-attendance] select error:", selectErr);
            return errorResponse("SERVER_ERROR", 500);
        }
        if (!reservation) {
            // Stesso codice e stesso testo del token invalido.
            return errorResponse("INVALID_LINK", 404);
        }

        const activity = reservation.activity as { name: string };

        const buildSummary = (guestConfirmedAt: string | null) => ({
            venue_name: activity.name,
            reservation_date: reservation.reservation_date,
            reservation_time: reservation.reservation_time,
            party_size: reservation.party_size,
            customer_name: reservation.customer_name,
            status: reservation.status,
            guest_confirmed_at: guestConfirmedAt,
            // Confermabile solo finche' la prenotazione e' in piedi: una
            // annullata o rifiutata non torna viva da qui.
            can_confirm: reservation.status === "confirmed"
        });

        if (action === "read") {
            return jsonResponse(
                { success: true, reservation: buildSummary(reservation.guest_confirmed_at ?? null) },
                200
            );
        }

        // ── action === "confirm" ────────────────────────────────────────
        if (reservation.status !== "confirmed") {
            return errorResponse("NOT_CONFIRMABLE", 409, {
                current_status: reservation.status
            });
        }

        // Gia' confermata: successo idempotente con il timestamp ORIGINALE.
        // Chi ripreme non vede un errore e non riscrive l'ora: quella che
        // conta e' la prima, ed e' quella che la sala legge.
        if (reservation.guest_confirmed_at) {
            return jsonResponse(
                {
                    success: true,
                    already_confirmed: true,
                    reservation: buildSummary(reservation.guest_confirmed_at)
                },
                200
            );
        }

        // Lo `status` NON compare nella SET: la conferma del cliente non e' una
        // transizione. `.is(..., null)` chiude la corsa fra due pressioni
        // ravvicinate — chi arriva secondo non sovrascrive.
        const { data: updated, error: updateErr } = await supabase
            .from("reservations")
            .update({ guest_confirmed_at: new Date().toISOString() })
            .eq("id", reservationId)
            .eq("status", "confirmed")
            .is("guest_confirmed_at", null)
            .select("id, guest_confirmed_at")
            .maybeSingle();

        if (updateErr) {
            console.error("[confirm-reservation-attendance] update error:", updateErr);
            return errorResponse("SERVER_ERROR", 500);
        }

        if (!updated) {
            // Qualcuno e' arrivato primo fra la SELECT e l'UPDATE, oppure lo
            // stato e' cambiato. Si rilegge per rispondere con il dato vero
            // invece di indovinare.
            const { data: recheck } = await supabase
                .from("reservations")
                .select("status, guest_confirmed_at")
                .eq("id", reservationId)
                .maybeSingle();

            if (recheck?.guest_confirmed_at) {
                return jsonResponse(
                    {
                        success: true,
                        already_confirmed: true,
                        reservation: buildSummary(recheck.guest_confirmed_at)
                    },
                    200
                );
            }
            return errorResponse("NOT_CONFIRMABLE", 409, {
                current_status: recheck?.status ?? reservation.status
            });
        }

        console.log(
            `[confirm-reservation-attendance] reservation ${updated.id} confirmed by guest.`
        );

        return jsonResponse(
            {
                success: true,
                already_confirmed: false,
                reservation: buildSummary(updated.guest_confirmed_at)
            },
            200
        );
    } catch (err) {
        console.error("[confirm-reservation-attendance] unhandled error:", err);
        return errorResponse("SERVER_ERROR", 500);
    }
});
