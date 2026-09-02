// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, RateLimitExceededError } from "../_shared/rateLimit.ts";

// =============================================================================
// reservation-availability
// =============================================================================
//
// Lettura pubblica: dati una sede, una data e un numero di coperti, dice quali
// fra gli orari proposti accettano una prenotazione.
//
// Chiude un difetto che precede il pacing: fino a ieri il cliente compilava
// tutto il modulo e scopriva AL SUBMIT che l'orario era pieno. Adesso lo vede
// prima di scegliere.
//
// ── LA GRIGLIA ARRIVA DAL CLIENT ────────────────────────────────────────────
// `times` è la lista che il picker ha già deciso di mostrare. Quali orari
// esistano dipende da orari di apertura, chiusure straordinarie e dalla regola
// della coda oltre mezzanotte, logica che vive in `reservationSlots.ts`:
// rigenerarla qui sarebbe una seconda copia da tenere allineata. Il client
// possiede "quali slot esistono", il server "quali accettano".
//
// ── COSA NON ESCE DA QUI ────────────────────────────────────────────────────
// Solo `{ time, available }`. Niente conteggi, niente posti residui, niente
// tetti configurati, nemmeno il motivo del blocco: sono informazioni
// commerciali del locale. Al cliente il motivo non cambia nulla — in entrambi
// i casi deve scegliere un altro orario — e il messaggio dettagliato resta al
// submit.
//
// Per lo stesso motivo tutti i fallimenti di gate (sede inesistente, sospesa,
// prenotazioni disabilitate, abbonamento, feature di piano) collassano su un
// unico codice: nessun oracolo che permetta di distinguere "questo slug non
// esiste" da "questo locale è sospeso".
//
// ── LA VERITÀ RESTA AL SUBMIT ───────────────────────────────────────────────
// La risposta è una fotografia scattata qualche secondo prima. Il ricontrollo
// autoritativo è `place_online_reservation` sotto advisory lock. Il 409 al
// submit non sparisce: diventa raro.
// =============================================================================

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// ── Rate limit ──────────────────────────────────────────────────────────────
// Tarato per una LETTURA, non per una scrittura: i numeri di
// `submit-reservation` (15/min per slug) qui sarebbero sbagliati. Quel bucket
// è condiviso da tutti i visitatori della stessa sede, e con venti persone sul
// menù si esaurirebbe in un minuto bloccando la pagina a tutti.
//
// UN SOLO bucket, per IP. Ce n'era un secondo per slug come tetto anti-flood,
// rimosso dopo la misura: `checkRateLimit` è una SCRITTURA (RPC
// `increment_rate_limit`), e due scritture per proteggere una lettura che
// costa 1,8 ms di SQL sono più care del lavoro che difendono. Il bucket per IP
// è quello che regola davvero: una sessione reale fa 4-8 chiamate, 60/min
// copre largamente e taglia lo scripting.
const RATE_LIMIT_IP_PER_MIN = 60;
const RATE_LIMIT_IP_WINDOW_SECONDS = 60;

// Una giornata intera a 15 minuti. Tetto al lavoro per richiesta; la stessa
// soglia è ribadita dentro la funzione SQL (difesa in profondità).
const MAX_TIMES = 96;

const VALID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

const ERROR_MESSAGES: Record<string, string> = {
    METHOD_NOT_ALLOWED: "Metodo non consentito",
    INVALID_PAYLOAD:    "Dati non validi",
    // Volutamente unico e vago: vedi nota sull'oracolo in testa al file.
    UNAVAILABLE:        "Disponibilità non consultabile",
    RATE_LIMITED:       "Troppe richieste. Riprova più tardi.",
    SERVER_ERROR:       "Errore durante il controllo della disponibilità"
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

function extractClientIp(req: Request): string {
    const xff = req.headers.get("x-forwarded-for") ?? "";
    const first = xff.split(",")[0]?.trim();
    if (first && first.length > 0) return first;
    const real = req.headers.get("x-real-ip");
    if (real && real.trim().length > 0) return real.trim();
    return "unknown";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
        return errorResponse("METHOD_NOT_ALLOWED", 405);
    }

    try {
        const body = (await req.json()) as Record<string, unknown>;

        const slug = typeof body.slug === "string" ? body.slug.trim() : "";
        if (!slug) {
            return errorResponse("INVALID_PAYLOAD", 400, { field: "slug" });
        }

        const reservationDate =
            typeof body.reservation_date === "string" ? body.reservation_date.trim() : "";
        if (!reservationDate || !DATE_RE.test(reservationDate)) {
            return errorResponse("INVALID_PAYLOAD", 400, { field: "reservation_date" });
        }

        const partySizeRaw = body.party_size;
        if (
            typeof partySizeRaw !== "number" ||
            !Number.isInteger(partySizeRaw) ||
            partySizeRaw < 1 ||
            partySizeRaw > 50
        ) {
            return errorResponse("INVALID_PAYLOAD", 400, { field: "party_size" });
        }
        const partySize = partySizeRaw;

        if (!Array.isArray(body.times)) {
            return errorResponse("INVALID_PAYLOAD", 400, { field: "times" });
        }
        // Dedup preservando l'ordine: la risposta segue la griglia del client.
        const seen = new Set<string>();
        const times: string[] = [];
        for (const raw of body.times) {
            if (typeof raw !== "string") {
                return errorResponse("INVALID_PAYLOAD", 400, { field: "times" });
            }
            const t = raw.trim().slice(0, 5);
            if (!TIME_RE.test(t)) {
                return errorResponse("INVALID_PAYLOAD", 400, { field: "times" });
            }
            if (seen.has(t)) continue;
            seen.add(t);
            times.push(t);
        }
        if (times.length === 0) {
            return new Response(JSON.stringify({ slots: [] }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }
        if (times.length > MAX_TIMES) {
            return errorResponse("INVALID_PAYLOAD", 400, { field: "times", reason: "too_many" });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // ── Gate, in ONDATE anziché in fila ──────────────────────────
        // Erano sei round trip sequenziali: misurati, ~250 ms su ~400 di
        // risposta totale, mentre l'SQL che fa il lavoro vero ne costa 1,8.
        // Qui restano tre ondate, imposte dalle dipendenze REALI dei dati:
        // `tenants` ha bisogno di `activity.tenant_id`, la feature e la
        // disponibilità di `activity.id`. Ciò che non dipende da nulla parte
        // insieme.
        //
        // La semantica dei gate NON cambia: gli esiti si valutano nello stesso
        // ordine di prima e il primo che fallisce decide la risposta. In
        // parallelo va solo l'ATTESA, non la decisione.

        // Ondata 1 — rate limit e risoluzione dello slug non si conoscono.
        // `allSettled` e non `all`: se il rate limit scatta mentre la select è
        // ancora in volo, l'altra promise deve poter fallire senza diventare
        // un rejection non gestito.
        const [rlResult, activityResult] = await Promise.allSettled([
            checkRateLimit(supabase, {
                // Namespace distinto da `submit-reservation`: le due superfici
                // non devono consumarsi a vicenda.
                key: `reservation-availability:ip:${extractClientIp(req)}`,
                limit: RATE_LIMIT_IP_PER_MIN,
                windowSeconds: RATE_LIMIT_IP_WINDOW_SECONDS
            }),
            supabase
                .from("activities")
                .select("id, tenant_id, status, enable_reservations")
                .eq("slug", slug)
                .maybeSingle()
        ]);

        // Il rate limit resta il PRIMO a decidere: 429 a prescindere da come è
        // andata la select, che non ha effetti da annullare (è una lettura).
        if (rlResult.status === "rejected") {
            const rlErr = rlResult.reason;
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
        if (activityResult.status === "rejected") throw activityResult.reason;

        // ── Gate sede: stessi controlli di submit-reservation ─────────
        // Esiti diversi, risposta identica (UNAVAILABLE 409): il client non
        // deve poter distinguere una sede inesistente da una sospesa.
        const { data: activity, error: activityError } = activityResult.value;
        if (activityError) throw activityError;
        if (
            !activity ||
            activity.status !== "active" ||
            activity.enable_reservations !== true
        ) {
            return errorResponse("UNAVAILABLE", 409);
        }

        // Ondata 2 — abbonamento e feature di piano dipendono entrambi dalla
        // sede appena risolta, ma non l'uno dall'altro.
        const [tenantRes, featureRes] = await Promise.all([
            supabase
                .from("tenants")
                .select("subscription_status, deleted_at")
                .eq("id", activity.tenant_id)
                .maybeSingle(),
            supabase.rpc("activity_has_feature", {
                p_activity_id: activity.id,
                p_feature_id: "table_reservation"
            })
        ]);

        const { data: tenant, error: tenantStateError } = tenantRes;
        if (tenantStateError) throw tenantStateError;
        if (
            !tenant ||
            tenant.deleted_at !== null ||
            !VALID_SUBSCRIPTION_STATUSES.has(tenant.subscription_status)
        ) {
            return errorResponse("UNAVAILABLE", 409);
        }

        const { data: hasReservationFeature, error: featErr } = featureRes;
        if (featErr || hasReservationFeature !== true) {
            return errorResponse("UNAVAILABLE", 409);
        }

        // ── Disponibilità ────────────────────────────────────────────
        // Stessa logica del submit: la funzione SQL chiama gli helper
        // `reservation_pacing_block` e `reservation_peak_with_candidate`, gli
        // stessi che usa `place_online_reservation`. Nessuna regola riscritta
        // qui dentro — se la matrice cambia, cambia per entrambi.
        const { data: rows, error: availabilityError } = await supabase.rpc(
            "get_reservation_day_availability",
            {
                p_activity_id: activity.id,
                p_reservation_date: reservationDate,
                p_party_size: partySize,
                p_times: times
            }
        );
        if (availabilityError) throw availabilityError;

        // Normalizza "HH:MM:SS" → "HH:MM": la griglia del client ragiona in
        // minuti e deve poter fare match diretto sulle chiavi che ha mandato.
        const slots = (rows ?? []).map((r: { slot_time: string; available: boolean }) => ({
            time: String(r.slot_time).slice(0, 5),
            available: r.available === true
        }));

        return new Response(JSON.stringify({ slots }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("[reservation-availability] error:", err);
        return errorResponse("SERVER_ERROR", 500);
    }
});
