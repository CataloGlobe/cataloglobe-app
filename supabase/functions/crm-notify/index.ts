// @ts-nocheck
// =============================================================================
// crm-notify — notifiche e solleciti Telegram dei lead del CRM
// =============================================================================
//
// Invocata da pg_cron ogni minuto, solo quando c'è lavoro (migration
// 20261001130300). Tre passate ogni minuto, più una al giorno (4):
//
// 1. OUTBOX: i lead con `notified_at IS NULL`.
//    * locale nuovo → a tutto il team collegato a Telegram;
//    * lead tornato (stesso telefono) → solo a chi lo ha in carico, o a tutti
//      se nessuno ce l'ha; se chi ce l'ha non ha collegato Telegram, niente
//      (`pickOutboxRecipients`);
//    * lead ricevuto più di 24 ore fa → segnato come notificato e già
//      sollecitato, senza messaggio (rete di sicurezza: un arretrato non
//      inonda il bot, nemmeno coi «Lead fermo» al primo collegamento).
//    Le righe dell'import CSV non passano di qui: entrano già notificate e già
//    sollecitate (`crm_ingest_lead` con p_silent) e l'import manda un solo
//    riepilogo (passata 3).
//    `notified_at` si scrive solo se tutti gli invii sono andati (e c'era
//    almeno un destinatario): altrimenti il giro dopo riprova. Ogni invio si
//    prenota prima in `crm_telegram_messages` (UNIQUE lead+utente+tipo, mig
//    20261001130400): niente doppioni a chi l'ha già ricevuto, né tra due
//    giri accavallati.
//
// 2. SOLLECITO: carta ancora in Nuovo da 2 ore contate nella fascia 9-21 di
//    Roma (`isEscalationDue`) → messaggio all'assegnato e a chi riceve le
//    escalation (Lorenzo), una volta sola (`escalated_at`) + evento.
//
// 3. RIEPILOGO IMPORT: le righe di `crm_import_runs` con `notified_at IS NULL`
//    → un messaggio a tutto il team collegato. Prenotazione con l'UPDATE di
//    `notified_at`; se nessun invio va, si libera e il giro dopo riprova.
//
// 4. RINNOVI (solo col body {"job":"renewals"}, dal cron delle 9 di Roma,
//    mig 20261003120300): gli abbonamenti della sezione costi che si rinnovano
//    entro i loro giorni di preavviso (`crm_expense_renewals_due`) → un
//    messaggio a tutto il team collegato. Prenotazione con l'UPDATE di
//    `reminded_for`; se nessun invio va, si libera e il giorno dopo riprova.
//
// 5. AGENDA (solo col body {"job":"agenda"}, dal cron ogni 5 minuti, mig
//    20261003230300, solo se crm_agenda_has_work): eventi del calendario
//    Google, «Puoi tu?» a chi deve chiamare, brief un'ora prima, «Com'è
//    andata?» dopo (`processAgenda` in _shared/crmAgendaJob.ts).
//
// 6. RIEPILOGO SETTIMANALE (solo col body {"job":"weekly"}, dal cron del
//    lunedì alle 8 di Roma, mig 20261004020200): i numeri della settimana
//    appena finita (crm_summary) per email a tutto il team del CRM.
//    Prenotazione con `crm_settings.summary_mail_week`.
//
// AUTENTICAZIONE fail-CLOSED: X-Job-Secret = CRM_JOB_SECRET (vault
// `crm_job_secret`), confronto constant-time.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRM_JOB_SECRET,
// TELEGRAM_BOT_TOKEN, APP_URL (facoltativo: link «Apri nel CRM»),
// CRM_WA_LINK_SECRET (facoltativo: senza, niente pulsante WhatsApp),
// GOOGLE_SERVICE_ACCOUNT_JSON (facoltativo: agenda su Google Calendar),
// RESEND_API_KEY (riepilogo settimanale).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualStr } from "../_shared/timingSafeEqual.ts";
import { getPublicSiteUrl } from "../_shared/publicSiteUrl.ts";
import { telegramCall } from "../_shared/telegramApi.ts";
import {
    buildImportSummaryMessage,
    buildLeadMessage,
    isEscalationDue,
    pickOutboxRecipients
} from "../_shared/crmTelegram.ts";
import { loadLeadMessageData, loadTeam, whatsappLinkFor } from "../_shared/crmLeadMessage.ts";
import { buildRenewalReminderMessage } from "../_shared/crmExpenses.ts";
import { processAgenda } from "../_shared/crmAgendaJob.ts";
import { buildWeeklyEmail, lastWeekBounds } from "../_shared/crmWeeklyEmail.ts";
import { sendEmailWithResult } from "../_shared/sendEmail.ts";
import { sendToTeam } from "../_shared/crmTeamAlert.ts";

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

const CLAIM_STALE_MS = 5 * 60_000;

/**
 * Manda il messaggio di un lead a un destinatario, se non l'ha già ricevuto.
 * L'invio si prenota prima con la riga in `crm_telegram_messages` (message_id
 * nullo): due giri accavallati non mandano lo stesso messaggio due volte.
 */
async function sendTo(supabase, lead, member, data, team, kind): Promise<boolean> {
    const { data: claim, error: claimError } = await supabase
        .from("crm_telegram_messages")
        .insert({
            lead_id: lead.id,
            venue_id: lead.venue_id,
            user_id: member.user_id,
            kind,
            chat_id: member.telegram_chat_id,
            message_id: null
        })
        .select("id")
        .single();

    if (claimError) {
        if (claimError.code !== "23505") throw claimError;
        const { data: existing } = await supabase
            .from("crm_telegram_messages")
            .select("id, message_id, created_at")
            .eq("lead_id", lead.id)
            .eq("user_id", member.user_id)
            .eq("kind", kind)
            .maybeSingle();
        if (existing?.message_id != null) return true;
        // Prenotazione di un giro caduto a metà: la libero, il giro dopo riprova.
        if (existing && Date.now() - new Date(existing.created_at).getTime() > CLAIM_STALE_MS) {
            await supabase.from("crm_telegram_messages").delete().eq("id", existing.id).is("message_id", null);
        }
        return false;
    }

    const message = buildLeadMessage(data, member.user_id, team, await whatsappLinkFor(lead.id, member.user_id));
    const result = await telegramCall(BOT_TOKEN, "sendMessage", {
        chat_id: member.telegram_chat_id,
        text: message.text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: message.reply_markup
    });
    if (!result.ok) {
        console.warn("crm-notify: invio fallito", member.user_id, result.description);
        await supabase.from("crm_telegram_messages").delete().eq("id", claim.id);
        return false;
    }

    const { error } = await supabase
        .from("crm_telegram_messages")
        .update({ message_id: result.result.message_id })
        .eq("id", claim.id);
    if (error) console.error("crm-notify: messaggio non registrato", error.code, error.message);
    return true;
}

async function processOutbox(supabase, team, appUrl, now: Date) {
    const stats = { notified: 0, skipped_stale: 0, failed: 0, no_recipients: 0, assignee_not_linked: 0 };
    const { data: leads, error } = await supabase
        .from("crm_leads")
        .select("id, venue_id, received_at, created_at, crm_venues(assigned_to)")
        .is("notified_at", null)
        .order("received_at", { ascending: true })
        .limit(BATCH);
    if (error) throw error;

    for (const lead of leads ?? []) {
        if (now.getTime() - new Date(lead.received_at).getTime() > STALE_AFTER_MS) {
            // Anche escalated_at: senza, al primo collegamento di Telegram
            // partirebbe un «Lead fermo» per ognuno (mig 20261002120000).
            await supabase
                .from("crm_leads")
                .update({ notified_at: now.toISOString(), escalated_at: now.toISOString() })
                .eq("id", lead.id);
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
        const { recipients, done } = pickOutboxRecipients(kind, assignee, team);
        if (done) {
            await supabase.from("crm_leads").update({ notified_at: now.toISOString() }).eq("id", lead.id);
            stats.assignee_not_linked += 1;
            continue;
        }

        // Nessuno collegato a Telegram: il lead resta in coda (fino alle 24 ore).
        if (recipients.length === 0) {
            stats.no_recipients += 1;
            continue;
        }

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
        if (recipients.length === 0) continue;
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

async function processImportRuns(supabase, team, appUrl, now: Date) {
    const stats = { import_summaries: 0 };
    const { data: runs, error } = await supabase
        .from("crm_import_runs")
        .select("id, created_by, created_count, returned_count, duplicate_count, suppressed_count, failed_count")
        .is("notified_at", null)
        .order("created_at", { ascending: true })
        .limit(BATCH);
    if (error) throw error;

    const linked = team.filter(m => m.telegram_chat_id !== null);

    for (const run of runs ?? []) {
        // Prenotazione: un solo giro manda il riepilogo.
        const { data: claimed, error: claimError } = await supabase
            .from("crm_import_runs")
            .update({ notified_at: now.toISOString() })
            .eq("id", run.id)
            .is("notified_at", null)
            .select("id");
        if (claimError) throw claimError;
        if (!claimed?.length || linked.length === 0) continue;

        const message = buildImportSummaryMessage({
            importerName: team.find(m => m.user_id === run.created_by)?.display_name ?? null,
            created: run.created_count,
            returned: run.returned_count,
            duplicate: run.duplicate_count,
            suppressed: run.suppressed_count,
            failed: run.failed_count,
            listUrl: appUrl ? `${appUrl}/admin/lead` : null
        });

        let sentAny = false;
        for (const member of linked) {
            const result = await telegramCall(BOT_TOKEN, "sendMessage", {
                chat_id: member.telegram_chat_id,
                text: message.text,
                parse_mode: "HTML",
                disable_web_page_preview: true,
                reply_markup: message.reply_markup
            });
            if (result.ok) sentAny = true;
            else console.warn("crm-notify: riepilogo import non inviato", member.user_id, result.description);
        }

        if (sentAny) {
            stats.import_summaries += 1;
        } else {
            await supabase.from("crm_import_runs").update({ notified_at: null }).eq("id", run.id);
        }
    }
    return stats;
}

/** «AAAA-MM-GG» del giorno a Roma. */
function romeToday(now: Date): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(now);
}

async function processRenewals(supabase, team, appUrl, now) {
    const stats = { renewal_reminders: 0 };
    const linked = team.filter(m => m.telegram_chat_id != null);
    if (linked.length === 0) return stats;

    const today = romeToday(now);
    const { data: due, error } = await supabase.rpc("crm_expense_renewals_due", { p_today: today });
    if (error) throw error;

    for (const row of due ?? []) {
        // Prenotazione: un solo giro ricorda questo rinnovo.
        const { data: claimed, error: claimError } = await supabase
            .from("crm_expenses")
            .update({ reminded_for: row.r_next_charge_on })
            .eq("id", row.r_expense_id)
            .or(`reminded_for.is.null,reminded_for.neq.${row.r_next_charge_on}`)
            .select("id");
        if (claimError) throw claimError;
        if (!claimed?.length) continue;

        const message = buildRenewalReminderMessage({
            name: row.r_name,
            amountCents: row.r_amount_cents,
            interval: row.r_billing_interval,
            nextChargeOn: row.r_next_charge_on,
            today,
            paidBy: row.r_paid_by,
            costsUrl: appUrl ? `${appUrl}/admin/costi` : null
        });

        let sentAny = false;
        for (const member of linked) {
            const result = await telegramCall(BOT_TOKEN, "sendMessage", {
                chat_id: member.telegram_chat_id,
                text: message.text,
                parse_mode: "HTML",
                disable_web_page_preview: true,
                reply_markup: message.reply_markup
            });
            if (result.ok) sentAny = true;
            else console.warn("crm-notify: promemoria rinnovo non inviato", member.user_id, result.description);
        }

        if (sentAny) {
            stats.renewal_reminders += 1;
        } else {
            await supabase.from("crm_expenses").update({ reminded_for: null }).eq("id", row.r_expense_id);
        }
    }
    return stats;
}

function romeHour(now: Date): number {
    return Number(new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", hourCycle: "h23" }).format(now));
}

async function processWeekly(supabase, team, appUrl, now) {
    const week = lastWeekBounds(now);
    const { data: claimed, error: claimError } = await supabase
        .from("crm_settings")
        .update({ summary_mail_week: week.key })
        .eq("id", true)
        .or(`summary_mail_week.is.null,summary_mail_week.neq.${week.key}`)
        .select("id");
    if (claimError) throw claimError;
    if (!claimed?.length) return { weekly: "already_sent" };

    const [{ data: current, error: e1 }, { data: previous, error: e2 }] = await Promise.all([
        supabase.rpc("crm_summary", { p_from: week.from.toISOString(), p_to: week.to.toISOString() }),
        supabase.rpc("crm_summary", { p_from: week.previousFrom.toISOString(), p_to: week.from.toISOString() })
    ]);
    if (e1 || e2) {
        await supabase.from("crm_settings").update({ summary_mail_week: null }).eq("id", true);
        throw e1 ?? e2;
    }
    const mail = buildWeeklyEmail({
        current,
        previous,
        weekLabel: week.label,
        summaryUrl: appUrl ? `${appUrl}/admin/riepilogo` : null
    });
    // Si contano solo gli invii riusciti. Nessuno riuscito: la settimana torna
    // libera e il giro dopo del cron (fino alle 10 di Roma) riprova; all'ultimo
    // giro (10:40) si avvisa il team su Telegram. Qualcuno riuscito: la settimana resta
    // presa (niente doppioni a chi l'ha ricevuta), i mancati restano nei log.
    // Un giro interrotto a metà (timeout dell'edge) lascia la settimana presa:
    // chi non l'ha ricevuta la perde, scelta voluta contro i doppioni.
    let sent = 0;
    let failed = 0;
    for (const member of team) {
        const { data } = await supabase.auth.admin.getUserById(member.user_id);
        const email = data?.user?.email;
        if (!email) continue;
        const ok = await sendEmailWithResult({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
        if (ok) sent += 1;
        else failed += 1;
    }
    if (sent === 0) {
        await supabase.from("crm_settings").update({ summary_mail_week: null }).eq("id", true);
        if (romeHour(now) >= 10 && now.getUTCMinutes() >= 40) {
            await sendToTeam(supabase, "La mail del lunedì col riepilogo non è partita. Il riepilogo è in /admin/riepilogo.", {
                logTag: "crm-notify weekly"
            });
        }
        return { weekly: "not_sent", recipients: 0, failed };
    }
    return { weekly: "sent", recipients: sent, failed };
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
        const body = await req.json().catch(() => ({}));
        if (body?.job === "agenda") {
            const agenda = await processAgenda(supabase, team, BOT_TOKEN, appUrl, now);
            console.log(JSON.stringify({ event: "crm_notify_agenda", ...agenda }));
            return json(200, agenda);
        }
        if (body?.job === "weekly") {
            const weekly = await processWeekly(supabase, team, appUrl, now);
            console.log(JSON.stringify({ event: "crm_notify_weekly", ...weekly }));
            return json(200, weekly);
        }
        if (body?.job === "renewals") {
            const renewals = await processRenewals(supabase, team, appUrl, now);
            console.log(JSON.stringify({ event: "crm_notify_renewals", ...renewals }));
            return json(200, renewals);
        }
        const outbox = await processOutbox(supabase, team, appUrl, now);
        const escalation = await processEscalations(supabase, team, appUrl, now);
        const imports = await processImportRuns(supabase, team, appUrl, now);
        console.log(JSON.stringify({ event: "crm_notify", ...outbox, ...escalation, ...imports }));
        return json(200, { ...outbox, ...escalation, ...imports });
    } catch (err) {
        const e = err as { code?: unknown; message?: unknown };
        console.error("crm-notify: error", e?.code ?? "", e?.message ?? String(err));
        return json(500, { error: "notify_failed" });
    }
});
