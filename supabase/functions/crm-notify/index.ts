// @ts-nocheck
// =============================================================================
// crm-notify — notifiche e solleciti Telegram dei lead del CRM
// =============================================================================
//
// Invocata da pg_cron ogni minuto, solo quando c'è lavoro (migration
// 20261001130300). Due passate:
//
// 1. OUTBOX: i lead con `notified_at IS NULL`.
//    * locale nuovo → a tutto il team collegato a Telegram;
//    * lead tornato (stesso telefono) → solo all'assegnato, o a tutti se
//      nessuno ce l'ha;
//    * lead ricevuto più di 24 ore fa (import CSV di arretrati) → segnato come
//      notificato senza messaggio, per non inondare il bot.
//    `notified_at` si scrive solo se tutti gli invii sono andati: altrimenti il
//    giro dopo riprova, e `crm_telegram_messages` (UNIQUE lead+utente+tipo)
//    evita di rimandare a chi l'ha già ricevuto.
//
// 2. SOLLECITO: carta ancora in Nuovo da 2 ore contate nella fascia 9-21 di
//    Roma (`isEscalationDue`) → messaggio all'assegnato e a chi riceve le
//    escalation (Lorenzo), una volta sola (`escalated_at`) + evento.
//
// AUTENTICAZIONE fail-CLOSED: X-Job-Secret = CRM_JOB_SECRET (vault
// `crm_job_secret`), confronto constant-time.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRM_JOB_SECRET,
// TELEGRAM_BOT_TOKEN, APP_URL (facoltativo: link «Apri nel CRM»).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualStr } from "../_shared/timingSafeEqual.ts";
import { getPublicSiteUrl } from "../_shared/publicSiteUrl.ts";
import { telegramCall } from "../_shared/telegramApi.ts";
import { buildLeadMessage, isEscalationDue } from "../_shared/crmTelegram.ts";
import { loadLeadMessageData, loadTeam } from "../_shared/crmLeadMessage.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JOB_SECRET = Deno.env.get("CRM_JOB_SECRET");
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

const BATCH = 20;
const STALE_AFTER_MS = 24 * 60 * 60_000;

function json(status: number, body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

/** Manda il messaggio di un lead a un destinatario, se non l'ha già ricevuto. */
async function sendTo(supabase, lead, member, data, team, kind): Promise<boolean> {
    const { data: existing } = await supabase
        .from("crm_telegram_messages")
        .select("id")
        .eq("lead_id", lead.id)
        .eq("user_id", member.user_id)
        .eq("kind", kind)
        .maybeSingle();
    if (existing) return true;

    const message = buildLeadMessage(data, member.user_id, team);
    const result = await telegramCall(BOT_TOKEN, "sendMessage", {
        chat_id: member.telegram_chat_id,
        text: message.text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: message.reply_markup
    });
    if (!result.ok) {
        console.warn("crm-notify: invio fallito", member.user_id, result.description);
        return false;
    }

    const { error } = await supabase.from("crm_telegram_messages").insert({
        lead_id: lead.id,
        venue_id: lead.venue_id,
        user_id: member.user_id,
        kind,
        chat_id: member.telegram_chat_id,
        message_id: result.result.message_id
    });
    if (error) console.error("crm-notify: messaggio non registrato", error.code, error.message);
    return true;
}

async function processOutbox(supabase, team, appUrl, now: Date) {
    const stats = { notified: 0, skipped_stale: 0, failed: 0 };
    const { data: leads, error } = await supabase
        .from("crm_leads")
        .select("id, venue_id, received_at, created_at, crm_venues(assigned_to)")
        .is("notified_at", null)
        .order("received_at", { ascending: true })
        .limit(BATCH);
    if (error) throw error;

    const linked = team.filter(m => m.telegram_chat_id !== null);

    for (const lead of leads ?? []) {
        if (now.getTime() - new Date(lead.received_at).getTime() > STALE_AFTER_MS) {
            await supabase.from("crm_leads").update({ notified_at: now.toISOString() }).eq("id", lead.id);
            stats.skipped_stale += 1;
            continue;
        }

        // Tornato = il locale aveva già un ingresso prima di questo.
        const { count } = await supabase
            .from("crm_leads")
            .select("id", { count: "exact", head: true })
            .eq("venue_id", lead.venue_id)
            .lt("created_at", lead.created_at);
        const kind = (count ?? 0) > 0 ? "returned" : "new_lead";

        const data = await loadLeadMessageData(supabase, lead.id, kind, appUrl, now);
        if (!data) continue;

        const assignee = lead.crm_venues?.assigned_to ?? null;
        const recipients =
            kind === "returned" && assignee && linked.some(m => m.user_id === assignee)
                ? linked.filter(m => m.user_id === assignee)
                : linked;

        let allSent = true;
        for (const member of recipients) {
            const sent = await sendTo(supabase, lead, member, data, team, kind);
            allSent = allSent && sent;
        }

        if (allSent) {
            await supabase.from("crm_leads").update({ notified_at: now.toISOString() }).eq("id", lead.id);
            stats.notified += 1;
        } else {
            stats.failed += 1;
        }
    }
    return stats;
}

async function processEscalations(supabase, team, appUrl, now: Date) {
    const stats = { escalated: 0 };
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60_000).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();

    const { data: leads, error } = await supabase
        .from("crm_leads")
        .select("id, venue_id, received_at, crm_venues!inner(stage, assigned_to)")
        .eq("crm_venues.stage", "nuovo")
        .not("notified_at", "is", null)
        .is("escalated_at", null)
        .lt("received_at", twoHoursAgo)
        .gt("received_at", weekAgo)
        .limit(BATCH);
    if (error) throw error;

    for (const lead of leads ?? []) {
        if (!isEscalationDue(new Date(lead.received_at), now)) continue;

        const assignee = lead.crm_venues?.assigned_to ?? null;
        const recipients = team.filter(
            m => m.telegram_chat_id !== null && (m.receives_escalations || m.user_id === assignee)
        );
        const data = await loadLeadMessageData(supabase, lead.id, "escalation", appUrl, now);
        if (!data) continue;

        let allSent = true;
        for (const member of recipients) {
            const sent = await sendTo(supabase, lead, member, data, team, "escalation");
            allSent = allSent && sent;
        }
        if (!allSent) continue;

        await supabase.from("crm_leads").update({ escalated_at: now.toISOString() }).eq("id", lead.id);
        await supabase.from("crm_events").insert({
            venue_id: lead.venue_id,
            lead_id: lead.id,
            type: "escalated",
            payload: { to: recipients.map(m => m.user_id) }
        });
        stats.escalated += 1;
    }
    return stats;
}

Deno.serve(async (req: Request) => {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    const provided = req.headers.get("X-Job-Secret");
    if (!JOB_SECRET || !provided || !timingSafeEqualStr(provided, JOB_SECRET)) {
        return json(401, { error: "unauthorized" });
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !BOT_TOKEN) {
        console.error("crm-notify: env mancante (URL / service role / TELEGRAM_BOT_TOKEN)");
        return json(500, { error: "misconfigured" });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const now = new Date();
    const appUrl = getPublicSiteUrl();

    try {
        const team = await loadTeam(supabase);
        const outbox = await processOutbox(supabase, team, appUrl, now);
        const escalation = await processEscalations(supabase, team, appUrl, now);
        console.log(JSON.stringify({ event: "crm_notify", ...outbox, ...escalation }));
        return json(200, { ...outbox, ...escalation });
    } catch (err) {
        const e = err as { code?: unknown; message?: unknown };
        console.error("crm-notify: error", e?.code ?? "", e?.message ?? String(err));
        return json(500, { error: "notify_failed" });
    }
});
