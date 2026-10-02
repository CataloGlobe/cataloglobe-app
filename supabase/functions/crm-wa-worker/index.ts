// @ts-nocheck
// =============================================================================
// crm-wa-worker — il Mac di WhatsApp Web parla col CRM solo da qui (F1-2)
// =============================================================================
//
// Sul Mac di casa Claude in Chrome tiene aperto WhatsApp Web sul numero
// dell'agente; il comando `scripts/crm-wa/crm-wa.mjs` chiama questa edge.
// Il Mac non tocca il database: tutte le regole stanno nelle funzioni SQL
// (migration 20261002170100).
//
// POST { action, ... } con X-Worker-Secret = CRM_WA_WORKER_SECRET:
//   * heartbeat { state: ok|needs_relink|warning, detail?, version? }
//       il Mac è vivo e dice cosa vede. Da ricollegare o avviso → agenti in
//       pausa e messaggio al team.
//   * chats { chats: [{ phone?, messages: [{ id, from_me?, kind?, text?, at? }] }] }
//       istantanee delle chat (fino a 20 per chiamata). I messaggi nuovi del
//       lead partono su Telegram a chi ha il locale in carico.
//   * next {}
//       il prossimo messaggio da mandare: { send: { message_id, phone, body } }
//       oppure { wait: { reason, seconds } }. Il testo del primo messaggio si
//       scrive qui, dal testo delle impostazioni.
//   * result { message_id, ok, wa_message_id?, error? }
//       esito dell'invio. Terzo fallimento di fila → pausa e messaggio.
// POST { action: "watchdog" } con X-Job-Secret = CRM_JOB_SECRET (pg_cron,
// migration 20261002170300): Mac muto da 15 minuti → pausa e messaggio; ritenta
// l'avviso di pausa che Telegram non aveva consegnato.
//
// AUTENTICAZIONE fail-CLOSED, confronto constant-time; segreti mai nei log.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRM_WA_WORKER_SECRET,
// CRM_JOB_SECRET, TELEGRAM_BOT_TOKEN, APP_URL (facoltativo: «Apri nel CRM»).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualStr } from "../_shared/timingSafeEqual.ts";
import { getPublicSiteUrl } from "../_shared/publicSiteUrl.ts";
import { fillWhatsappTemplate } from "../_shared/crmWhatsapp.ts";
import { sendToTeam } from "../_shared/crmTeamAlert.ts";
import { buildChannelAlert, buildInboundAlert, parseSnapshotBatch } from "../_shared/crmWaWorker.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const WORKER_SECRET = Deno.env.get("CRM_WA_WORKER_SECRET");
const JOB_SECRET = Deno.env.get("CRM_JOB_SECRET");

const OUTBOX_BATCH = 50;
const LOG = "crm-wa-worker";

function json(status: number, body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function secretMatches(given: string | null, expected: string | undefined): boolean {
    return !!expected && !!given && timingSafeEqualStr(given, expected);
}

// Un avviso di pausa che Telegram non consegna resta in crm_wa_channel.alert_pending
// e lo ritenta il watchdog (ogni 5 minuti): col Mac spento è l'unico che gira.
async function alertChannel(supabase, code, detail?: string | null): Promise<void> {
    const delivered = await sendToTeam(supabase, buildChannelAlert(code, detail), { logTag: LOG });
    const { error } = await supabase
        .from("crm_wa_channel")
        .update({ alert_pending: delivered > 0 ? null : code })
        .eq("id", true);
    if (error) console.error(`${LOG}: avviso in sospeso non registrato`, error.code);
}

async function retryPendingAlert(supabase): Promise<boolean> {
    const { data, error } = await supabase
        .from("crm_wa_channel")
        .select("alert_pending")
        .eq("id", true)
        .maybeSingle();
    if (error) {
        console.error(`${LOG}: avviso in sospeso non letto`, error.code);
        return false;
    }
    if (!data?.alert_pending) return false;
    await alertChannel(supabase, data.alert_pending);
    return true;
}

// -----------------------------------------------------------------------------
// Messaggi del lead → Telegram, uno per locale, a chi lo ha in carico
// -----------------------------------------------------------------------------
async function flushInbound(supabase): Promise<number> {
    const { data: rows, error } = await supabase
        .from("crm_messages")
        .select("id, venue_id, kind, body, crm_contacts(name), crm_venues(name, name_pending, assigned_to)")
        .eq("direction", "in")
        .is("notified_at", null)
        .order("created_at")
        .limit(OUTBOX_BATCH);
    if (error) {
        console.error(`${LOG}: outbox non letta`, error.code);
        return 0;
    }
    if (!rows?.length) return 0;

    // Prenotazione: un'altra chiamata accavallata non le rimanda.
    const now = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase
        .from("crm_messages")
        .update({ notified_at: now })
        .in("id", rows.map(r => r.id))
        .is("notified_at", null)
        .select("id");
    if (claimError) {
        console.error(`${LOG}: outbox non prenotata`, claimError.code);
        return 0;
    }
    const mine = new Set((claimed ?? []).map(r => r.id));

    const byVenue = new Map();
    for (const row of rows) {
        if (!mine.has(row.id)) continue;
        const group = byVenue.get(row.venue_id) ?? { rows: [], venue: row.crm_venues, contact: row.crm_contacts };
        group.rows.push(row);
        byVenue.set(row.venue_id, group);
    }

    const appUrl = getPublicSiteUrl();
    let sent = 0;
    for (const [venueId, group] of byVenue) {
        const text = buildInboundAlert({
            contactName: group.contact?.name ?? null,
            venueName: group.venue?.name_pending ? "locale da completare" : (group.venue?.name ?? "Locale"),
            messages: group.rows.map(r => ({ kind: r.kind, body: r.body })),
            adminUrl: appUrl ? `${appUrl}/admin/lead/${venueId}` : null
        });
        const delivered = await sendToTeam(supabase, text, {
            preferUserIds: [group.venue?.assigned_to ?? null],
            logTag: LOG
        });
        if (delivered > 0) {
            sent += group.rows.length;
            continue;
        }
        // Nessun invio: si liberano per il giro dopo.
        await supabase
            .from("crm_messages")
            .update({ notified_at: null })
            .in("id", group.rows.map(r => r.id))
            .eq("notified_at", now);
    }
    return sent;
}

// -----------------------------------------------------------------------------
// Azioni
// -----------------------------------------------------------------------------
async function heartbeat(supabase, body) {
    const state = typeof body?.state === "string" ? body.state : "";
    const detail = typeof body?.detail === "string" ? body.detail : null;
    const version = typeof body?.version === "string" ? body.version : null;
    const { data, error } = await supabase.rpc("crm_wa_heartbeat", { p_state: state, p_detail: detail, p_version: version });
    if (error) {
        if (error.message?.includes("invalid_wa_state")) return json(400, { error: "invalid_state" });
        console.error(`${LOG}: battito non registrato`, error.code);
        return json(500, { error: "heartbeat_failed" });
    }
    if (data) await alertChannel(supabase, data, detail);
    const notified = await flushInbound(supabase);
    const { data: settings } = await supabase.from("crm_settings").select("brake_on").maybeSingle();
    return json(200, { ok: true, brake_on: settings?.brake_on ?? true, notified });
}

async function chats(supabase, body) {
    const parsed = parseSnapshotBatch(body);
    if (!parsed.ok) return json(400, { error: parsed.error });

    const results = [];
    for (const chat of parsed.value) {
        const { data, error } = await supabase.rpc("crm_wa_ingest_chat", {
            p_phone: chat.phone,
            p_messages: chat.messages
        });
        if (error) {
            console.error(`${LOG}: chat non salvata`, error.code);
            results.push({ phone: chat.phone, status: "error" });
            continue;
        }
        const row = data?.[0];
        results.push({
            phone: chat.phone,
            status: row?.r_status ?? "error",
            new_in: row?.r_new_in ?? 0,
            new_person: row?.r_new_person ?? 0,
            matched: row?.r_matched ?? 0
        });
    }
    const notified = await flushInbound(supabase);
    return json(200, { ok: true, chats: results, notified });
}

async function senderNameFor(supabase, venueId: string): Promise<string | null> {
    // {mittente}: chi ha il locale in carico, altrimenti chi riceve i lead nuovi.
    const { data: venue } = await supabase.from("crm_venues").select("assigned_to").eq("id", venueId).maybeSingle();
    const { data: team } = await supabase.from("crm_team_members").select("user_id, display_name, is_default_assignee");
    const members = team ?? [];
    const owner = members.find(m => m.user_id === venue?.assigned_to) ?? members.find(m => m.is_default_assignee);
    return owner?.display_name ?? null;
}

async function next(supabase) {
    const { data, error } = await supabase.rpc("crm_wa_claim_next");
    const row = data?.[0];
    if (error || !row) {
        console.error(`${LOG}: coda non letta`, error?.code);
        return json(500, { error: "claim_failed" });
    }
    if (row.r_reason === "failures" || row.r_reason === "needs_relink" || row.r_reason === "warning") {
        await alertChannel(supabase, row.r_reason);
    }
    if (row.r_reason !== "send") {
        return json(200, { wait: { reason: row.r_reason, seconds: row.r_wait_seconds } });
    }

    let text = row.r_body;
    if (!text && row.r_purpose === "first_message" && row.r_template) {
        text = fillWhatsappTemplate(row.r_template, {
            contactName: row.r_contact_name,
            venueName: row.r_name_pending ? null : row.r_venue_name,
            senderName: await senderNameFor(supabase, row.r_venue_id)
        });
        const { error: bodyError } = await supabase
            .from("crm_messages")
            .update({ body: text })
            .eq("id", row.r_message_id)
            .eq("status", "sending");
        if (bodyError) text = null;
    }
    if (!text?.trim()) {
        // Senza testo (o solo spazi) non si manda: esito fallito, così il messaggio non resta in invio.
        const { data: outcome, error: reportError } = await supabase.rpc("crm_wa_report_result", {
            p_message_id: row.r_message_id,
            p_ok: false,
            p_error: "Testo del messaggio mancante."
        });
        if (reportError) console.error(`${LOG}: esito del testo mancante non registrato`, reportError.code);
        if (outcome === "failures") await alertChannel(supabase, "failures");
        return json(200, { wait: { reason: "empty", seconds: 5 } });
    }
    return json(200, { send: { message_id: row.r_message_id, phone: row.r_phone, body: text } });
}

async function result(supabase, body) {
    const messageId = typeof body?.message_id === "string" ? body.message_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(messageId) || typeof body?.ok !== "boolean") {
        return json(400, { error: "invalid_result" });
    }
    const { data, error } = await supabase.rpc("crm_wa_report_result", {
        p_message_id: messageId,
        p_ok: body.ok,
        p_wa_message_id: typeof body.wa_message_id === "string" ? body.wa_message_id : null,
        p_error: typeof body.error === "string" ? body.error : null
    });
    if (error) {
        if (error.message?.includes("message_not_sending")) return json(409, { error: "message_not_sending" });
        console.error(`${LOG}: esito non registrato`, error.code);
        return json(500, { error: "result_failed" });
    }
    if (data === "failures") await alertChannel(supabase, "failures");
    return json(200, { ok: true });
}

async function watchdog(supabase) {
    const { data, error } = await supabase.rpc("crm_wa_watchdog");
    if (error) {
        console.error(`${LOG}: controllo del Mac non riuscito`, error.code);
        return json(500, { error: "watchdog_failed" });
    }
    if (data === true) await alertChannel(supabase, "silent");
    else await retryPendingAlert(supabase);
    return json(200, { ok: true, alerted: data === true });
}

Deno.serve(async (req: Request) => {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(500, { error: "not_configured" });

    const body = await req.json().catch(() => null);
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "watchdog") {
        if (!secretMatches(req.headers.get("x-job-secret"), JOB_SECRET)) return json(401, { error: "unauthorized" });
    } else if (!secretMatches(req.headers.get("x-worker-secret"), WORKER_SECRET)) {
        return json(401, { error: "unauthorized" });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    switch (action) {
        case "heartbeat":
            return heartbeat(supabase, body);
        case "chats":
            return chats(supabase, body);
        case "next":
            return next(supabase);
        case "result":
            return result(supabase, body);
        case "watchdog":
            return watchdog(supabase);
        default:
            return json(400, { error: "invalid_action" });
    }
});
