// sunmi-device-callback — riceve le notifiche di stato dispositivo da Sunmi
// (device information callback, capitolo 5 di Cloud Printer V2).
//
// Server-to-server, come stripe-webhook: nessun JWT utente, CORS non
// necessario (mai chiamato da un browser). L'UNICO perimetro di sicurezza e'
// la verifica firma (`verifySunmiCallbackSignature` in `_shared/sunmi.ts`) —
// verify_jwt = false qui non e' un rilassamento rispetto agli altri
// endpoint, e' lo standard del progetto; la firma sostituisce l'auth.
//
// Quattro tipi di evento (Sunmi-NotifyType header / report_type nel body):
//   1 basic info    — accolto e ignorato (nessuna colonna dedicata)
//   2 status info   — device_status_data.lack_paper_count/paper_will_end_count
//   3 timing info   — accolto e ignorato (nessuna colonna dedicata)
//   4 online info   — device_online_data.action (1 online, 2 offline)
//
// report_type 2: lack_paper_count e' un CONTATORE CUMULATIVO ("quante volte
// e' mancata la carta da sempre"), non uno stato. Vedi il commento sulla
// colonna in 20260915094512_printer_device_status.sql: un incremento rispetto
// all'ultimo valore persistito accende `out_of_paper`; il primo evento mai
// ricevuto per una stampante (lack_paper_count locale NULL) inizializza il
// riferimento senza accendere nulla.
//
// Idempotenza: sunmi_callback_events, stesso pattern di stripe_processed_events
// (stripe-webhook) — INSERT prima del dispatch, completed_at dopo il successo.
// Chiave naturale della notifica: (sn, notify_type, timestamp, nonce), la
// stessa quadrupla che Sunmi manda nell'header a ogni tentativo/retry.
//
// Risposta: la stringa "SUCCESS" in testo semplice e SOLO quella significa
// "consegnato" per Sunmi — qualunque altra cosa (incluso un JSON) fa
// ritentare. Su firma non valida o payload malformato si risponde con errore
// (mai "SUCCESS"): Sunmi ritenta, e un tentativo con firma sbagliata e'
// esattamente il segnale che vogliamo loggare, non nascondere.
//
// Error codes (corpo testo semplice, MAI "SUCCESS"):
//   400 INVALID_BODY / MISSING_HEADERS · 401 INVALID_SIGNATURE · 500 INTERNAL_ERROR

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
    readSunmiCredentialsFromEnv,
    verifySunmiCallbackSignature,
    type SunmiCallbackHeaders
} from "../_shared/sunmi.ts";

// ============================================================
// Constants
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FUNCTION_NAME = "sunmi-device-callback";

const textHeaders = { "Content-Type": "text/plain" };

function textResponse(status: number, body: string): Response {
    return new Response(body, { status, headers: textHeaders });
}

// ============================================================
// Types — body del callback (solo i campi che leggiamo davvero)
// ============================================================

interface DeviceStatusData {
    lack_paper_count?: unknown;
    paper_will_end_count?: unknown;
}

interface DeviceOnlineData {
    action?: unknown;
}

interface CallbackBody {
    sn?: unknown;
    report_type?: unknown;
    device_status_data?: unknown;
    device_online_data?: unknown;
}

// ============================================================
// Helpers — header
// ============================================================

function _extractCallbackHeaders(req: Request): SunmiCallbackHeaders | null {
    const appId = req.headers.get("Sunmi-Appid");
    const timestamp = req.headers.get("Sunmi-Timestamp");
    const nonce = req.headers.get("Sunmi-Nonce");
    const notifyType = req.headers.get("Sunmi-NotifyType");
    const sign = req.headers.get("Sunmi-Sign");
    if (!appId || !timestamp || !nonce || !notifyType || !sign) return null;
    return { appId, timestamp, nonce, notifyType, sign };
}

/** Whitelist per il log — mai il body intero (puo' contenere GPS, IMEI, ecc). */
function _safeLogFields(headers: SunmiCallbackHeaders, sn: string | null, reportType: number | null) {
    return {
        sn,
        report_type: reportType,
        notify_type: headers.notifyType,
        timestamp: headers.timestamp
    };
}

// ============================================================
// Helpers — parsing body
// ============================================================

function _parseBody(raw: unknown): { sn: string; reportType: number; body: CallbackBody } | null {
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as CallbackBody;
    if (typeof obj.sn !== "string" || obj.sn.trim().length === 0) return null;
    if (typeof obj.report_type !== "number" || ![1, 2, 3, 4].includes(obj.report_type)) return null;
    return { sn: obj.sn, reportType: obj.report_type, body: obj };
}

/** Contatore Sunmi: intero >= 0. Qualunque altra cosa (assente, negativo, non numero) → null, ignorato. */
function _asCounter(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

// ============================================================
// Idempotenza
// ============================================================

/**
 * true = evento nuovo, procedere. false = replay di un evento GIA' completato
 * (rispondere SUCCESS senza ri-applicare l'update). Su riga esistente ma NON
 * completata (tentativo precedente fallito a meta'), si riprocessa: stesso
 * pattern di stripe-webhook.
 */
async function _claimEvent(
    supabase: SupabaseClient,
    sn: string,
    headers: SunmiCallbackHeaders
): Promise<{ kind: "process" } | { kind: "already_done" } | { kind: "db_error"; message: string }> {
    const { error: insertError } = await supabase.from("sunmi_callback_events").insert({
        sn,
        notify_type: headers.notifyType,
        sunmi_timestamp: headers.timestamp,
        sunmi_nonce: headers.nonce
    });

    if (!insertError) return { kind: "process" };

    if (insertError.code === "23505") {
        const { data: existing, error: selectError } = await supabase
            .from("sunmi_callback_events")
            .select("completed_at")
            .eq("sn", sn)
            .eq("notify_type", headers.notifyType)
            .eq("sunmi_timestamp", headers.timestamp)
            .eq("sunmi_nonce", headers.nonce)
            .maybeSingle();
        if (selectError) return { kind: "db_error", message: selectError.message };
        if (existing?.completed_at) return { kind: "already_done" };
        return { kind: "process" }; // tentativo precedente incompleto: riprocessa
    }

    return { kind: "db_error", message: insertError.message };
}

async function _markEventCompleted(
    supabase: SupabaseClient,
    sn: string,
    headers: SunmiCallbackHeaders
): Promise<void> {
    const { error } = await supabase
        .from("sunmi_callback_events")
        .update({ completed_at: new Date().toISOString() })
        .eq("sn", sn)
        .eq("notify_type", headers.notifyType)
        .eq("sunmi_timestamp", headers.timestamp)
        .eq("sunmi_nonce", headers.nonce);
    if (error) {
        console.error(`[${FUNCTION_NAME}] mark_completed_failed`, {
            event: "sunmi_callback_mark_completed_failed",
            sn,
            error: error.message
        });
    }
}

// ============================================================
// Dispatch per report_type
// ============================================================

/**
 * report_type 2 — stato dispositivo. `lack_paper_count` e' un contatore
 * cumulativo: confronta col valore persistito, accende `out_of_paper` solo
 * se e' aumentato E c'era gia' un valore di riferimento (non al primo evento).
 */
async function _handleStatusData(
    supabase: SupabaseClient,
    sn: string,
    data: DeviceStatusData
): Promise<{ ok: true } | { ok: false; message: string }> {
    const newLackCount = _asCounter(data.lack_paper_count);
    const newWillEndCount = _asCounter(data.paper_will_end_count);

    const { data: printerRow, error: selectError } = await supabase
        .from("printers")
        .select("id, lack_paper_count")
        .eq("sn", sn)
        .maybeSingle();
    if (selectError) return { ok: false, message: selectError.message };
    if (!printerRow) return { ok: true }; // sn non nostro (scollegata/altra installazione): niente da fare

    const priorLackCount = (printerRow as { lack_paper_count: number | null }).lack_paper_count;
    const shouldRaiseAlert =
        newLackCount !== null && priorLackCount !== null && newLackCount > priorLackCount;

    const patch: Record<string, unknown> = { last_status_at: new Date().toISOString() };
    if (newLackCount !== null) patch.lack_paper_count = newLackCount;
    if (newWillEndCount !== null) patch.paper_will_end_count = newWillEndCount;
    if (shouldRaiseAlert) patch.out_of_paper = true;

    const { error: updateError } = await supabase
        .from("printers")
        .update(patch)
        .eq("id", (printerRow as { id: string }).id);
    if (updateError) return { ok: false, message: updateError.message };
    return { ok: true };
}

/** report_type 4 — online/offline. `action`: 1 online, 2 offline. */
async function _handleOnlineData(
    supabase: SupabaseClient,
    sn: string,
    data: DeviceOnlineData
): Promise<{ ok: true } | { ok: false; message: string }> {
    if (data.action !== 1 && data.action !== 2) return { ok: true }; // valore inatteso: ignora, non e' un errore nostro

    const isOnline = data.action === 1;
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = { is_online: isOnline, last_status_at: nowIso };
    // last_online_at = "ultimo istante visto online" (semantica preesistente
    // della colonna): si aggiorna solo quando action=1, mai su un evento offline.
    if (isOnline) patch.last_online_at = nowIso;

    const { error } = await supabase.from("printers").update(patch).eq("sn", sn);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
}

// ============================================================
// Main
// ============================================================

serve(async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
        return textResponse(405, "METHOD_NOT_ALLOWED");
    }

    const headers = _extractCallbackHeaders(req);
    if (!headers) {
        console.warn(`[${FUNCTION_NAME}] missing_headers`);
        return textResponse(400, "MISSING_HEADERS");
    }

    let rawBody: string;
    try {
        rawBody = await req.text();
    } catch {
        return textResponse(400, "INVALID_BODY");
    }

    const credentials = readSunmiCredentialsFromEnv();
    if (!credentials) {
        console.error(`[${FUNCTION_NAME}] sunmi credentials not configured`);
        return textResponse(500, "INTERNAL_ERROR");
    }

    // Verifica firma SUL BODY RAW, prima di qualunque parsing — un payload
    // malformato non deve mai avere un percorso che bypassa la firma.
    const validSignature = await verifySunmiCallbackSignature(
        rawBody,
        headers,
        credentials.appId,
        credentials.appKey
    );
    if (!validSignature) {
        console.warn(`[${FUNCTION_NAME}] invalid_signature`, {
            event: "sunmi_callback_invalid_signature",
            notify_type: headers.notifyType,
            timestamp: headers.timestamp
        });
        return textResponse(401, "INVALID_SIGNATURE");
    }

    let parsedJson: unknown;
    try {
        parsedJson = JSON.parse(rawBody);
    } catch {
        return textResponse(400, "INVALID_BODY");
    }
    const parsed = _parseBody(parsedJson);
    if (!parsed) {
        console.warn(`[${FUNCTION_NAME}] invalid_body_shape`);
        return textResponse(400, "INVALID_BODY");
    }
    const { sn, reportType, body } = parsed;

    console.log(`[${FUNCTION_NAME}] received`, _safeLogFields(headers, sn, reportType));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    try {
        const claim = await _claimEvent(supabase, sn, headers);
        if (claim.kind === "db_error") {
            console.error(`[${FUNCTION_NAME}] claim_failed`, { error: claim.message });
            return textResponse(500, "INTERNAL_ERROR");
        }
        if (claim.kind === "already_done") {
            return textResponse(200, "SUCCESS"); // replay: già applicato, ack senza ri-eseguire
        }

        let result: { ok: true } | { ok: false; message: string } = { ok: true };
        if (reportType === 2) {
            result = await _handleStatusData(supabase, sn, (body.device_status_data ?? {}) as DeviceStatusData);
        } else if (reportType === 4) {
            result = await _handleOnlineData(supabase, sn, (body.device_online_data ?? {}) as DeviceOnlineData);
        }
        // reportType 1 e 3: accolti, nessuna colonna dedicata — result resta ok.

        if (!result.ok) {
            console.error(`[${FUNCTION_NAME}] apply_failed`, {
                event: "sunmi_callback_apply_failed",
                sn,
                report_type: reportType,
                error: result.message
            });
            return textResponse(500, "INTERNAL_ERROR"); // non completato: un retry riprova
        }

        await _markEventCompleted(supabase, sn, headers);
        return textResponse(200, "SUCCESS");
    } catch (e) {
        console.error(`[${FUNCTION_NAME}] internal error:`, (e as Error)?.message, (e as Error)?.stack);
        return textResponse(500, "INTERNAL_ERROR");
    }
});
