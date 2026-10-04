// @ts-nocheck
// =============================================================================
// Agente WhatsApp in prova (F1-3): il giro dell'edge crm-agent, con I/O
// =============================================================================
// Ogni minuto, solo se crm_agent_has_work (cron 20261004010300):
//   1. bozze scadute: il lead ha scritto di nuovo prima del tocco;
//   2. avviso delle bozze nuove ad Alex e Lorenzo, coi tasti del tipo;
//   3. solleciti ogni 5 minuti, al massimo 12, mai di notte;
//   4. se le risposte sono accese e il freno è tolto: i candidati
//      (crm_agent_candidates). Per ognuno, prima le regole (stop esplicito →
//      Perso; stop incerto → «stop o obiezione?»; «chiamami adesso» → serve una
//      persona), poi Claude per la bozza e il Revisore. I follow-up solo con
//      agent_followups_on, mai di notte, con l'attesa di followUpDueAt.
// Il modello non scrive mai al lead: scrive una bozza. Al lead va solo ciò
// che una persona approva su Telegram (crm_agent_decide_draft).
//
// ⚠️ SYNC con crm_agent_has_work e crm_agent_candidates (migration
// 20261004010100).
// Env: CRM_ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, GOOGLE_SERVICE_ACCOUNT_JSON
// (facoltativa: orari liberi senza Google), APP_URL (facoltativo).
// =============================================================================

import { telegramCall } from "./telegramApi.ts";
import { callCrmClaude } from "./crmClaude.ts";
import { sendToTeam } from "./crmTeamAlert.ts";
import { CRM_STAGE_LABEL } from "./crmLabels.ts";
import { CRM_TECHNICAL_ANSWER_KEYS, escapeHtml } from "./crmTelegram.ts";
import {
    FOLLOW_UP_MAX,
    mentionsCallTime,
    buildDraftRequest,
    buildReviewRequest,
    classifyLeadMessages,
    followUpDueAt,
    isAgentNight,
    parseDraftReply,
    parseReviewReply
} from "./crmAgentRules.ts";
import {
    buildAutoSentMessage,
    buildDraftClosedText,
    buildDraftMessage,
    buildRemindersText,
    buildTrustReadyText,
    reactivationReason,
    remindersDue
} from "./crmAgentMessages.ts";
import { loadAgendaBusy } from "./crmAgendaJob.ts";
import { formatCallDay, formatCallTime, parseCallWindows, suggestCallSlots } from "./crmCallSlots.ts";
import { fillWhatsappTemplate } from "./crmWhatsapp.ts";
import { whatsappLinkFor } from "./crmLeadMessage.ts";

const LOG = "crm-agent";
/** Solleciti di una bozza non toccata, in minuti dall'avviso. ⚠️ SYNC con crm_agent_has_work (SQL). */
export const REMINDER_AFTER_MINUTES = [10, 30, 60, 120];
const MAX_CANDIDATES = 3;
const CHAT_MESSAGES = 30;
/** Messaggi della chat mostrati sotto ogni bozza (meno se la chat è più corta). */
const DRAFT_CHAT_MESSAGES = 15;
const DRAFT_MAX_TOKENS = 700;
const REVIEW_MAX_TOKENS = 400;

const ROME_DT = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
});

function teamName(team, userId) {
    return team.find(m => m.user_id === userId)?.display_name ?? null;
}

// -----------------------------------------------------------------------------
// Dati di una bozza per Telegram
// -----------------------------------------------------------------------------
async function draftInfo(supabase, draft) {
    const [{ data: venue }, { data: contact }, { data: msgs }] = await Promise.all([
        supabase.from("crm_venues").select("name, assigned_to").eq("id", draft.venue_id).maybeSingle(),
        draft.contact_id
            ? supabase.from("crm_contacts").select("name").eq("id", draft.contact_id).maybeSingle()
            : Promise.resolve({ data: null }),
        supabase
            .from("crm_messages")
            .select("direction, status, author, body, created_at")
            .eq("venue_id", draft.venue_id)
            .not("body", "is", null)
            .lte("created_at", draft.created_at)
            .order("created_at", { ascending: false })
            .limit(DRAFT_CHAT_MESSAGES)
    ]);
    // Chi chiamerà: chi ha il locale, altrimenti chi conferma (crm_agent_decide_draft).
    const { data: caller } =
        draft.kind === "schedule" && venue?.assigned_to
            ? await supabase.from("crm_team_members").select("display_name").eq("user_id", venue.assigned_to).maybeSingle()
            : { data: null };
    return {
        draftId: draft.id,
        venueId: draft.venue_id,
        kind: draft.kind,
        venueName: venue?.name ?? "Locale",
        contactName: contact?.name ?? null,
        proposedText: draft.proposed_text ?? null,
        reason: draft.reason ?? null,
        proposedStartsAt: draft.proposed_starts_at ?? null,
        followUpNumber: draft.follow_up_number ?? null,
        callerName: caller?.display_name ?? null,
        lastMessages: (msgs ?? [])
            .filter(m => m.direction === "in" || m.author === "person" || m.status === "sent")
            .reverse()
            .map(m => ({ from: m.direction === "in" ? "lead" : "noi", text: m.body }))
    };
}

/** Riscrive i messaggi Telegram di una bozza decisa o scaduta, senza tasti. */
export async function closeDraftMessages(supabase, botToken, draftId, status, actorName) {
    const { data: draft } = await supabase.from("crm_agent_drafts").select("*").eq("id", draftId).maybeSingle();
    if (!draft) return;
    const info = await draftInfo(supabase, draft);
    const text = buildDraftClosedText(info, status, actorName);
    const { data: sent } = await supabase
        .from("crm_agent_draft_messages")
        .select("chat_id, message_id")
        .eq("draft_id", draftId)
        .eq("role", "draft");
    for (const m of sent ?? []) {
        await telegramCall(botToken, "editMessageText", {
            chat_id: m.chat_id,
            message_id: m.message_id,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true
        });
    }
}

async function notifyDraft(supabase, botToken, team, draft, appUrl, autoSent = false) {
    const info = await draftInfo(supabase, draft);
    const draftMessage = autoSent ? null : buildDraftMessage(info, appUrl);
    let sent = 0;
    for (const member of team.filter(m => m.telegram_chat_id)) {
        // Partita da sola: col link alla chat WhatsApp, firmato per chi lo apre.
        const message =
            draftMessage ??
            buildAutoSentMessage(info, appUrl, draft.lead_id ? await whatsappLinkFor(draft.lead_id, member.user_id) : null);
        const r = await telegramCall(botToken, "sendMessage", {
            chat_id: member.telegram_chat_id,
            text: message.text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: message.reply_markup
        });
        if (r.ok && r.result?.message_id) {
            sent += 1;
            await supabase.from("crm_agent_draft_messages").insert({
                draft_id: draft.id,
                user_id: member.user_id,
                chat_id: member.telegram_chat_id,
                message_id: r.result.message_id,
                role: "draft"
            });
        } else {
            console.warn(`${LOG}: bozza non inviata`, member.user_id, r.description);
        }
    }
    return sent;
}

// -----------------------------------------------------------------------------
// Contesto per Claude
// -----------------------------------------------------------------------------
async function venueContext(supabase, venueId) {
    const { data: venue } = await supabase
        .from("crm_venues")
        .select("id, name, city, stage, stage_changed_at, name_pending, assigned_to")
        .eq("id", venueId)
        .maybeSingle();
    const { data: lead } = await supabase
        .from("crm_leads")
        .select("id, contact_id, interests, form_answers")
        .eq("venue_id", venueId)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    const contactId = lead?.contact_id ?? null;
    const { data: contact } = contactId
        ? await supabase.from("crm_contacts").select("id, name").eq("id", contactId).maybeSingle()
        : await supabase.from("crm_contacts").select("id, name").eq("venue_id", venueId).limit(1).maybeSingle();
    const { data: msgs } = await supabase
        .from("crm_messages")
        .select("id, direction, author, status, body, kind, created_at, sent_at")
        .eq("venue_id", venueId)
        .order("created_at", { ascending: false })
        .limit(CHAT_MESSAGES);
    const chat = (msgs ?? [])
        .filter(m => m.direction === "in" || m.author === "person" || m.status === "sent")
        .reverse();
    return { venue, lead, contact, chat };
}

/** L'ultimo messaggio del lead prima che il locale andasse in Perso. */
function lastInBeforeLost(chat, lostSince: string): { body: string; createdAt: string } | null {
    const since = new Date(lostSince).getTime();
    const m = [...chat].reverse().find(x => x.direction === "in" && x.body && new Date(x.created_at).getTime() <= since);
    return m ? { body: m.body, createdAt: m.created_at } : null;
}

function answersOf(lead) {
    return Object.entries(lead?.form_answers ?? {})
        .filter(([k, v]) => !CRM_TECHNICAL_ANSWER_KEYS.has(k) && v !== null && v !== undefined && String(v).trim() !== "")
        .map(([k, v]) => ({ label: k.replace(/_/g, " "), value: Array.isArray(v) ? v.join(", ") : String(v) }));
}

async function freeSlots(supabase, team, callerId, now) {
    try {
        const { data: s } = await supabase
            .from("crm_settings")
            .select("call_windows, call_duration_minutes, call_min_notice_minutes")
            .eq("id", true)
            .maybeSingle();
        const windows = parseCallWindows(s?.call_windows) ?? [];
        const to = new Date(now.getTime() + 7 * 24 * 60 * 60_000);
        const { busy } = await loadAgendaBusy(supabase, team, now, to);
        const relevant = busy
            .filter(b => !b.caller_user_id || b.caller_user_id === callerId)
            .map(b => ({ start: new Date(b.start), end: new Date(b.end), label: b.label }));
        // Un orario per giorno, i primi quattro giorni utili: l'agente ne propone due.
        const slots = suggestCallSlots({
            now,
            windows,
            durationMinutes: s?.call_duration_minutes ?? 10,
            minNoticeMinutes: Math.max(s?.call_min_notice_minutes ?? 60, 120),
            busy: relevant,
            days: 7,
            limit: 40
        });
        const perDay = new Map();
        for (const slot of slots) {
            const key = formatCallDay(slot);
            if (!perDay.has(key)) perDay.set(key, slot);
        }
        return [...perDay.values()].slice(0, 4).map(d => ({ label: `${formatCallDay(d)} alle ${formatCallTime(d)}`, iso: d.toISOString() }));
    } catch (err) {
        console.warn(`${LOG}: orari liberi non calcolati`, (err as Error)?.message);
        return [];
    }
}

const REACTIVATION_LOST_REASON = "Nessuna risposta alla riattivazione in 7 giorni.";

async function logDecision(supabase, row) {
    const { data } = await supabase.from("crm_agent_decisions").insert(row).select("id").single();
    return data?.id ?? null;
}

/**
 * Bozza con Claude e Revisore. Ritorna i campi della bozza da inserire, o
 * null se Claude non è raggiungibile (freno, tetti, chiave): il giro si
 * ferma senza bozza, ci riprova il minuto dopo.
 */
async function draftWithClaude(supabase, ctx, venueId) {
    let cost = 0;
    let notes = null;
    let lastText = null;
    for (let round = 1; round <= 2; round++) {
        const request = buildDraftRequest(ctx);
        if (notes) {
            request.messages[0].content += `\n\nIl Revisore ha bocciato la bozza precedente:\n${notes}\nRiscrivila rispettando le regole.`;
        }
        const first = await callCrmClaude(supabase, {
            role: "conversation",
            system: request.system,
            messages: request.messages,
            maxTokens: DRAFT_MAX_TOKENS,
            venueId
        });
        if (!first.ok) return { stop: first.reason };
        cost += first.costUsd ?? 0;
        let parsed = parseDraftReply(first.text);
        if ("invalid" in parsed) {
            const retry = await callCrmClaude(supabase, {
                role: "conversation",
                system: request.system,
                messages: [
                    ...request.messages,
                    { role: "assistant", content: first.text },
                    { role: "user", content: `Risposta non valida (${parsed.invalid}). Rispondi solo con il JSON richiesto.` }
                ],
                maxTokens: DRAFT_MAX_TOKENS,
                venueId
            });
            if (!retry.ok) return { stop: retry.reason };
            cost += retry.costUsd ?? 0;
            parsed = parseDraftReply(retry.text);
            if ("invalid" in parsed) {
                return { draft: { kind: "ask", reason: `Il modello non ha dato una bozza valida (${parsed.invalid}).`, proposed_text: null }, cost };
            }
        }
        if (parsed.action === "ask_humans") {
            return {
                draft: {
                    kind: ctx.kind === "bot_question" ? "bot_question" : "ask",
                    reason: parsed.reason,
                    proposed_text: parsed.text || null
                },
                cost
            };
        }
        if (parsed.action === "schedule") {
            // Al lead non va nessun testo del modello: niente Revisore.
            return { draft: { kind: "schedule", proposed_text: null, proposed_starts_at: parsed.startsAt, review_rounds: round }, cost };
        }
        lastText = parsed.text;
        // Il Revisore controlla ogni testo che andrebbe al lead.
        const review = buildReviewRequest({
            brandRules: ctx.brandRules,
            draft: parsed.text,
            lastLeadText: [...ctx.messages].reverse().find(m => m.from === "lead")?.text ?? ""
        });
        const checked = await callCrmClaude(supabase, {
            role: "reviewer",
            system: review.system,
            messages: review.messages,
            maxTokens: REVIEW_MAX_TOKENS,
            venueId
        });
        if (!checked.ok) return { stop: checked.reason };
        cost += checked.costUsd ?? 0;
        const verdict = parseReviewReply(checked.text);
        if (verdict.ok) {
            return {
                draft: { kind: ctx.kind === "follow_up" ? "follow_up" : "reply", proposed_text: parsed.text, review_rounds: round },
                cost
            };
        }
        notes = verdict.problems.map(p => `- ${p}`).join("\n");
    }
    return {
        draft: {
            kind: "ask",
            reason: "Il Revisore ha bocciato la bozza due volte.",
            proposed_text: lastText,
            review_notes: notes,
            review_rounds: 2
        },
        cost
    };
}

async function insertDraft(supabase, base, fields, options: { allowAuto?: boolean } = {}) {
    const { data, error } = await supabase
        .from("crm_agent_drafts")
        .insert({ ...base, ...fields })
        .select("*")
        .single();
    if (error) {
        // 23505: un'altra bozza aperta sullo stesso locale (giro accavallato).
        if (error.code === "23505") return null;
        console.error(`${LOG}: bozza non salvata`, error.code, error.message);
        // Senza una bozza il locale resterebbe candidato e Claude verrebbe
        // richiamato ogni minuto: si chiude il giro con una richiesta per una persona.
        if (fields.kind === "ask" && !fields.proposed_text) return null;
        return insertDraft(supabase, base, {
            kind: "ask",
            reason: "La bozza non si è salvata: serve una persona.",
            proposed_text: null,
            cost_usd: fields.cost_usd ?? 0
        });
    }
    if ((data.kind === "reply" || data.kind === "follow_up") && options.allowAuto !== false) {
        const { data: auto, error: autoError } = await supabase.rpc("crm_agent_auto_send", { p_draft_id: data.id });
        if (autoError) console.error(`${LOG}: invio autonomo`, autoError.code, autoError.message);
        if (auto === true) data.auto_sent = true;
    }
    await logDecision(supabase, {
        actor: "agent",
        action: "draft_created",
        reason: fields.reason ?? (fields.kind === "follow_up" ? "Sollecito proposto." : "Bozza proposta."),
        venue_id: base.venue_id,
        lead_id: base.lead_id,
        review_outcome: fields.review_rounds ? (fields.kind === "ask" ? "rejected" : "ok") : null,
        review_notes: fields.review_notes ?? null,
        payload: { draft_id: data.id, kind: fields.kind, cost_usd: fields.cost_usd ?? 0 }
    });
    return data;
}

// -----------------------------------------------------------------------------
// Il giro
// -----------------------------------------------------------------------------
export async function processAgent(supabase, team, botToken, appUrl, now = new Date()) {
    const stats = { expired: 0, notified: 0, reminders: 0, stops: 0, drafts: 0, auto_sent: 0, reactivations_lost: 0, skipped: 0, stopped_by: null };
    const nowIso = now.toISOString();
    const night = isAgentNight(now);

    // F1-7: i 3 giorni di prova passano anche senza approvazioni nuove.
    await supabase.rpc("crm_agent_trust_refresh");
    if (botToken) {
        const { data: ready } = await supabase
            .from("crm_agent_trust")
            .select("kind, approved_in_row")
            .eq("autonomous", true)
            .is("eligible_notified_at", null);
        if (ready?.length) {
            const { data: s } = await supabase.from("crm_settings").select("agent_autonomy_on").eq("id", true).maybeSingle();
            for (const t of ready) {
                const { data: claimed } = await supabase
                    .from("crm_agent_trust")
                    .update({ eligible_notified_at: nowIso })
                    .eq("kind", t.kind)
                    .is("eligible_notified_at", null)
                    .select("kind");
                if (claimed?.length) {
                    await sendToTeam(supabase, buildTrustReadyText(t.kind, t.approved_in_row, Boolean(s?.agent_autonomy_on)), { logTag: LOG });
                }
            }
        }
    }

    // 1. Scadute: il lead ha scritto di nuovo dopo la bozza.
    const { data: pending } = await supabase.from("crm_agent_drafts").select("*").eq("status", "pending");
    for (const d of pending ?? []) {
        // Nessuna decisione in 48 ore: si chiude (solleciti finiti da tempo).
        if (now.getTime() - new Date(d.created_at).getTime() > 48 * 60 * 60_000) {
            const { data: old } = await supabase
                .from("crm_agent_drafts")
                .update({ status: "expired", reason: "Nessuna decisione in 48 ore." })
                .eq("id", d.id)
                .eq("status", "pending")
                .select("id");
            if (old?.length) {
                stats.expired += 1;
                if (botToken) await closeDraftMessages(supabase, botToken, d.id, "expired", null);
            }
            continue;
        }
        if (d.kind === "stop_check") continue;
        const { data: newer } = await supabase
            .from("crm_messages")
            .select("id")
            .eq("venue_id", d.venue_id)
            .eq("direction", "in")
            .gt("created_at", d.created_at)
            .limit(1);
        if (!newer?.length) continue;
        const { data: changed } = await supabase
            .from("crm_agent_drafts")
            .update({ status: "expired", reason: "Il lead ha scritto di nuovo." })
            .eq("id", d.id)
            .eq("status", "pending")
            .select("id");
        if (changed?.length) {
            stats.expired += 1;
            if (botToken) await closeDraftMessages(supabase, botToken, d.id, "expired", null);
        }
    }

    if (botToken) {
        // 2. Avviso delle bozze nuove.
        const { data: fresh } = await supabase
            .from("crm_agent_drafts")
            .select("*")
            .eq("status", "pending")
            .is("notified_at", null)
            .limit(10);
        for (const d of fresh ?? []) {
            const { data: claimed } = await supabase
                .from("crm_agent_drafts")
                .update({ notified_at: nowIso, last_reminded_at: nowIso })
                .eq("id", d.id)
                .is("notified_at", null)
                .select("id");
            if (!claimed?.length) continue;
            const sent = await notifyDraft(supabase, botToken, team, d, appUrl);
            if (sent > 0) stats.notified += 1;
            else await supabase.from("crm_agent_drafts").update({ notified_at: null }).eq("id", d.id);
        }

        // 3. Solleciti, mai di notte: un messaggio solo per chi ha bozze in attesa,
        // con tutte quelle aperte, quando almeno una arriva al suo prossimo sollecito.
        if (!night) {
            const { data: open } = await supabase
                .from("crm_agent_drafts")
                .select("*")
                .eq("status", "pending")
                .not("notified_at", "is", null)
                .order("notified_at", { ascending: true })
                .limit(30);
            const due = (open ?? []).filter(d => remindersDue(d.notified_at, d.reminders, now, REMINDER_AFTER_MINUTES) > d.reminders);
            const claimedIds = new Set<string>();
            for (const d of due) {
                // Dopo una notte si salta ai solleciti già passati: ne parte uno, non tre.
                const reached = remindersDue(d.notified_at, d.reminders, now, REMINDER_AFTER_MINUTES);
                const { data: claimed } = await supabase
                    .from("crm_agent_drafts")
                    .update({ last_reminded_at: nowIso, reminders: reached })
                    .eq("id", d.id)
                    .eq("reminders", d.reminders)
                    .select("id");
                if (claimed?.length) claimedIds.add(d.id);
            }
            if (claimedIds.size) {
                const openDrafts = open ?? [];
                const { data: msgs } = await supabase
                    .from("crm_agent_draft_messages")
                    .select("draft_id, chat_id, message_id")
                    .in("draft_id", openDrafts.map(d => d.id))
                    .eq("role", "draft");
                const byChat = new Map<string, { draftId: string; messageId: number }[]>();
                for (const m of msgs ?? []) {
                    const list = byChat.get(String(m.chat_id)) ?? [];
                    list.push({ draftId: m.draft_id, messageId: m.message_id });
                    byChat.set(String(m.chat_id), list);
                }
                const infos = new Map();
                for (const d of openDrafts) infos.set(d.id, await draftInfo(supabase, d));
                for (const [chatId, list] of byChat) {
                    // Solo chi ha almeno una delle bozze arrivate al sollecito.
                    if (!list.some(x => claimedIds.has(x.draftId))) continue;
                    const items = list.map(x => {
                        const d = openDrafts.find(o => o.id === x.draftId);
                        return { info: infos.get(x.draftId), minutes: Math.round((now.getTime() - new Date(d.notified_at).getTime()) / 60_000) };
                    });
                    await telegramCall(botToken, "sendMessage", {
                        chat_id: chatId,
                        text: buildRemindersText(items),
                        // Con una bozza sola il sollecito risponde al suo messaggio.
                        ...(list.length === 1 ? { reply_to_message_id: list[0].messageId } : {})
                    });
                }
                stats.reminders += claimedIds.size;
            }
        }
    }

    // 4. Candidati.
    const { data: settings } = await supabase
        .from("crm_settings")
        .select("agent_replies_on, agent_followups_on, brake_on")
        .eq("id", true)
        .maybeSingle();
    if (!settings?.agent_replies_on || settings.brake_on) return stats;

    const { data: rules } = await supabase.from("crm_brand_rules").select("body").eq("status", "approved").maybeSingle();
    if (!rules?.body) {
        stats.stopped_by = "no_brand_rules";
        return stats;
    }

    const { data: candidates, error: candError } = await supabase.rpc("crm_agent_candidates", {
        p_now: nowIso,
        p_limit: MAX_CANDIDATES * 3
    });
    if (candError) throw candError;

    let worked = 0;
    for (const c of candidates ?? []) {
        if (worked >= MAX_CANDIDATES) break;
        // Riattivazione corta: nessuna risposta in 7 giorni, il locale torna
        // in Perso. Nessun messaggio al lead, nessun modello: anche di notte,
        // ma solo coi solleciti accesi (è la loro fine). Solo da Contattato e
        // con la fase non bloccata: se una persona l'ha spostato, decide lei.
        // Non conta fra i lavorati: un locale che non si sposta non toglie
        // il posto agli altri.
        if (c.r_kind === "reactivation_lost") {
            if (!settings.agent_followups_on) continue;
            const { data: v } = await supabase
                .from("crm_venues")
                .select("id, stage, stage_locked_at")
                .eq("id", c.r_venue_id)
                .maybeSingle();
            if (!v || v.stage !== "contattato" || v.stage_locked_at) continue;
            const { data: moved, error: moveError } = await supabase.rpc("crm_move_stage", {
                p_venue_id: v.id,
                p_stage: "perso",
                p_lost_kind: "obiezione",
                p_lost_reason: REACTIVATION_LOST_REASON,
                p_expected_stage: "contattato",
                p_actor_user_id: null
            });
            if (moveError || !moved) {
                console.warn(`${LOG}: ritorno in Perso non riuscito`, moveError?.code ?? "stage_changed");
                continue;
            }
            await logDecision(supabase, {
                actor: "agent",
                action: "reactivation_lost",
                reason: REACTIVATION_LOST_REASON,
                venue_id: v.id,
                payload: { from_stage: v.stage }
            });
            stats.reactivations_lost += 1;
            continue;
        }
        // F1-6: proposta di Perso e riattivazione, senza modello. Mai di notte.
        if (c.r_kind === "lost_proposal" || c.r_kind === "reactivation") {
            if (night) continue;
            // Come crm_agent_has_work: la proposta di Perso segue i follow-up.
            if (c.r_kind === "lost_proposal" && !settings.agent_followups_on) continue;
            worked += 1;
            const { venue, lead, contact, chat } = await venueContext(supabase, c.r_venue_id);
            if (!venue) continue;
            const base = { venue_id: venue.id, lead_id: lead?.id ?? null, contact_id: contact?.id ?? null, trigger_message_id: null };
            if (c.r_kind === "lost_proposal") {
                if (await insertDraft(supabase, base, { kind: "lost_proposal", reason: `${c.r_follow_ups} solleciti senza risposta.` }))
                    stats.drafts += 1;
                continue;
            }
            const { data: st } = await supabase.from("crm_settings").select("agent_reactivation_message").eq("id", true).maybeSingle();
            if (!st?.agent_reactivation_message) continue;
            const sender =
                teamName(team, venue.assigned_to) ?? teamName(team, team.find(m => m.is_default_assignee)?.user_id) ?? null;
            const text = fillWhatsappTemplate(st.agent_reactivation_message, {
                contactName: contact?.name ?? null,
                venueName: venue.name_pending ? null : venue.name,
                senderName: sender
            });
            // Un segnaposto sconosciuto nel testo: non si propone (lo dice il log).
            if (/\{[a-z_]+\}/i.test(text)) {
                console.warn(`${LOG}: testo della riattivazione con un segnaposto sconosciuto`);
                continue;
            }
            if (
                await insertDraft(supabase, base, {
                    kind: "reactivation",
                    reason: reactivationReason(lastInBeforeLost(chat, venue.stage_changed_at), venue.stage_changed_at, now),
                    proposed_text: text.slice(0, 1000)
                })
            )
                stats.drafts += 1;
            continue;
        }
        if (c.r_kind === "follow_up") {
            if (!settings.agent_followups_on || night) continue;
            if (c.r_follow_ups >= FOLLOW_UP_MAX) continue;
            const due = followUpDueAt({
                venueId: c.r_venue_id,
                lastOutAt: c.r_last_out_at ? new Date(c.r_last_out_at) : null,
                lastInAt: c.r_last_in_at ? new Date(c.r_last_in_at) : null,
                followUpsSinceLastIn: c.r_follow_ups
            });
            if (!due || due.getTime() > now.getTime()) continue;
        }
        // Di notte non si disturbano Alex e Lorenzo con bozze nuove: lo stop
        // esplicito invece si registra subito.
        worked += 1;
        const { venue, lead, contact, chat } = await venueContext(supabase, c.r_venue_id);
        if (!venue) continue;
        const base = {
            venue_id: venue.id,
            lead_id: lead?.id ?? null,
            contact_id: contact?.id ?? null,
            trigger_message_id: c.r_last_in_id ?? null
        };

        // Resta da approvare anche con l'autonomia: dubbio di stop già visto
        // come obiezione, orari chiesti da una persona, orari nel testo.
        let holdForPerson = false;
        if (c.r_kind === "reply") {
            const lastOut = c.r_last_out_at ? new Date(c.r_last_out_at).getTime() : 0;
            const unanswered = chat.filter(m => m.direction === "in" && new Date(m.created_at).getTime() > lastOut);
            const signals = classifyLeadMessages(unanswered.map(m => m.body));
            if (signals.stop === "explicit") {
                const quote = (unanswered.at(-1)?.body ?? "").slice(0, 200);
                const { error } = await supabase.rpc("crm_agent_mark_stop", {
                    p_venue_id: venue.id,
                    p_reason: `Ha scritto: «${quote}»`
                });
                if (!error) {
                    stats.stops += 1;
                    await sendToTeam(
                        supabase,
                        `✋ <b>${escapeHtml(venue.name)}</b> ha chiesto di non essere più contattato: «${escapeHtml(quote)}». Messo in Perso (stop) e i messaggi in attesa sono stati cancellati.`,
                        { logTag: LOG }
                    );
                } else {
                    console.error(`${LOG}: stop non registrato`, error.code, error.message);
                }
                continue;
            }
            if (night) {
                stats.skipped += 1;
                continue;
            }
            if (signals.stop === "uncertain" && !c.r_objection) {
                if (await insertDraft(supabase, base, { kind: "stop_check", reason: "Potrebbe essere uno stop." })) stats.drafts += 1;
                continue;
            }
            if (signals.stop === "uncertain") holdForPerson = true;
            if (signals.callNow) {
                if (await insertDraft(supabase, base, { kind: "ask", reason: "Chiede di essere chiamato subito: non si conferma un orario." }))
                    stats.drafts += 1;
                continue;
            }
            if (signals.botQuestion) {
                // Il modello propone una risposta, la decidono loro.
                const result = await draftWithClaude(supabase, await buildContext(supabase, team, venue, lead, contact, chat, "bot_question", rules.body, 0, now), venue.id);
                if (result.stop) {
                    stats.stopped_by = result.stop;
                    if (await insertDraft(supabase, base, { kind: "bot_question", reason: "Chiede se è un bot." })) stats.drafts += 1;
                    break;
                }
                const fields = {
                    ...result.draft,
                    kind: "bot_question",
                    reason: "Chiede se è un bot.",
                    proposed_starts_at: null,
                    cost_usd: result.cost
                };
                if (await insertDraft(supabase, base, fields)) stats.drafts += 1;
                continue;
            }
        } else if (night) {
            continue;
        }

        const kind = c.r_kind === "follow_up" ? "follow_up" : "reply";
        const ctx = await buildContext(supabase, team, venue, lead, contact, chat, kind, rules.body, c.r_follow_ups + 1, now);
        if (kind === "reply") {
            // «Proponi altro» su Telegram: altri orari, non quello di prima.
            const { data: other } = await supabase
                .from("crm_agent_drafts")
                .select("proposed_starts_at")
                .eq("venue_id", venue.id)
                .eq("kind", "schedule")
                .eq("status", "handled")
                .eq("reason", "Proponi altri orari.")
                .gte("created_at", c.r_last_in_at ?? "1970-01-01")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (other?.proposed_starts_at) {
                const d = new Date(other.proposed_starts_at);
                ctx.extraInstruction = `Il team ha chiesto di proporre orari diversi da ${formatCallDay(d)} alle ${formatCallTime(d)}: proponine due tra quelli liberi, non quello.`;
                ctx.freeSlots = ctx.freeSlots.filter(s => new Date(s.iso).getTime() !== d.getTime());
            }
        }
        const result = await draftWithClaude(supabase, ctx, venue.id);
        if (result.stop) {
            // Freno, tetti o chiave mancante: nessuna bozza, si riprova al giro dopo.
            stats.stopped_by = result.stop;
            break;
        }
        const fields = {
            ...result.draft,
            cost_usd: result.cost,
            follow_up_number: kind === "follow_up" ? c.r_follow_ups + 1 : null
        };
        const allowAuto =
            !holdForPerson && !ctx.extraInstruction && !fields.proposed_starts_at && !mentionsCallTime(fields.proposed_text);
        const saved = await insertDraft(supabase, base, fields, { allowAuto });
        if (saved) stats.drafts += 1;
        if (saved?.auto_sent) {
            stats.auto_sent += 1;
            await supabase.from("crm_agent_drafts").update({ notified_at: nowIso }).eq("id", saved.id);
            if (botToken) await notifyDraft(supabase, botToken, team, saved, appUrl, true);
        }
    }

    // Le bozze appena nate partono subito su Telegram.
    if (botToken && stats.drafts > 0) {
        const { data: fresh } = await supabase.from("crm_agent_drafts").select("*").eq("status", "pending").is("notified_at", null);
        for (const d of fresh ?? []) {
            const { data: claimed } = await supabase
                .from("crm_agent_drafts")
                .update({ notified_at: nowIso, last_reminded_at: nowIso })
                .eq("id", d.id)
                .is("notified_at", null)
                .select("id");
            if (!claimed?.length) continue;
            const sent = await notifyDraft(supabase, botToken, team, d, appUrl);
            if (sent > 0) stats.notified += 1;
            else await supabase.from("crm_agent_drafts").update({ notified_at: null }).eq("id", d.id);
        }
    }
    return stats;
}

async function buildContext(supabase, team, venue, lead, contact, chat, kind, brandRules, followUpNumber, now) {
    const callerId =
        team.find(m => m.user_id === venue.assigned_to)?.user_id ?? team.find(m => m.is_default_assignee)?.user_id ?? null;
    const senderName = teamName(team, venue.assigned_to) ?? teamName(team, callerId) ?? "Alessandro";
    return {
        kind,
        brandRules,
        senderName: senderName.split(/\s+/)[0],
        venueName: venue.name_pending ? null : venue.name,
        city: venue.city ?? null,
        contactName: contact?.name ?? null,
        stageLabel: CRM_STAGE_LABEL[venue.stage] ?? null,
        interests: lead?.interests ?? [],
        answers: answersOf(lead),
        freeSlots: await freeSlots(supabase, team, callerId, now),
        followUpNumber,
        messages: chat
            .filter(m => m.body)
            .map(m => ({
                from: m.direction === "in" ? "lead" : "noi",
                text: m.body,
                at: ROME_DT.format(new Date(m.sent_at ?? m.created_at))
            })),
        nowLabel: ROME_DT.format(now)
    };
}
