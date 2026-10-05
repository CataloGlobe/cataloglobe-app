// @ts-nocheck
// =============================================================================
// crmGeaJob — Gea 1, il giro con database, Claude e Telegram (F1-8)
// =============================================================================
//
// Lo chiama il webhook di Telegram in sottofondo (EdgeRuntime.waitUntil),
// dopo aver già risposto 200 a Telegram. Regole e testi in crmGea.ts.
//
//   handleGeaMessage  un messaggio in chat privata da una persona del team
//                     che non è /start né una risposta a una bozza:
//                     ingresso unico → capire → strumento o comando → risposta.
//   handleGeaConfirm  «Sì, fallo» / «No» su un comando del gruppo 2.
//   think             il giro di una domanda, usato anche da crm-gea-web.
//
// Gea non scrive mai ai lead: i comandi usano solo le funzioni del CRM che
// cambiano fase, assegnazione, note e pausa, con la persona come attore.
// Il client `supabase` è service role.
// =============================================================================

import { telegramCall } from "./telegramApi.ts";
import { callCrmClaude } from "./crmClaude.ts";
import { refreshVenueMessages } from "./crmLeadMessage.ts";
import { encodeGeaConfirm } from "./crmTelegram.ts";
import { answerReads, writeText } from "./crmGeaReads.ts";
import {
    GEA_MAX_INPUT,
    GEA_MEMORY_MINUTES,
    GEA_MEMORY_TURNS,
    GEA_TEXT,
    buildTodayText,
    buildUnderstandRequest,
    chooseVenue,
    choosePerson,
    commandDoneText,
    commandNoopText,
    confirmButtonLabels,
    confirmQuestionText,
    isStopLocked,
    moveConfirmText,
    moveNeedsConfirmation,
    stopLockedText,
    diaryReason,
    manyVenuesText,
    needsConfirmation,
    noVenueText,
    parseUnderstanding,
    refuseText,
    sourceLine,
    type GeaCommand,
    type GeaTurn
} from "./crmGea.ts";

export interface Outcome {
    status: "answered" | "pending" | "refused" | "failed";
    intent?: string;
    tool?: string;
    reply: string;
    costUsd: number;
    error?: string;
    pending?: Record<string, unknown>;
}

const claudeFailText = (reason: string) =>
    reason === "day_cap" || reason === "month_cap" ? GEA_TEXT.capReached : GEA_TEXT.unavailable;

async function rpc(supabase, fn: string, args: Record<string, unknown> = {}) {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw Object.assign(new Error(error.message), { code: error.code, fn });
    return data;
}

async function resolveVenue(supabase, query: string) {
    const matches = (await rpc(supabase, "crm_gea_find_venues", { p_query: query })) ?? [];
    return chooseVenue(matches, query);
}

// -----------------------------------------------------------------------------
// Memoria corta (Gea 2): gli ultimi scambi con la stessa persona, dalla
// tabella che già registra ogni messaggio. Nessuna tabella nuova.
// -----------------------------------------------------------------------------
async function recentTurns(supabase, userId: string, currentId: string, now: Date): Promise<GeaTurn[]> {
    const since = new Date(now.getTime() - GEA_MEMORY_MINUTES * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from("crm_gea_inbox")
        .select("id, body, reply")
        .eq("user_id", userId)
        .neq("id", currentId)
        .in("status", ["answered", "refused", "pending"])
        .gte("created_at", since)
        .not("body", "is", null)
        .not("reply", "is", null)
        .order("created_at", { ascending: false })
        .limit(GEA_MEMORY_TURNS);
    // Senza memoria Gea risponde lo stesso: la memoria è un aiuto, non un requisito.
    if (error || !data) return [];
    return data.reverse().map(r => ({ asked: r.body, replied: r.reply }));
}

function deps(supabase, team) {
    return {
        rpc: (fn: string, args: Record<string, unknown> = {}) => rpc(supabase, fn, args),
        callModel: request => callCrmClaude(supabase, { role: "gea", ...request }),
        team
    };
}

async function brandRules(supabase): Promise<string | null> {
    const { data } = await supabase.from("crm_brand_rules").select("body").eq("status", "approved").maybeSingle();
    return data?.body ?? null;
}

// -----------------------------------------------------------------------------
// Comandi
// -----------------------------------------------------------------------------
/** Da dove arriva il comando: la pausa degli agenti lo registra come fonte. */
type GeaChannel = "telegram" | "admin";

async function runCommand(
    supabase, botToken: string, command, actor, team, appUrl, channel: GeaChannel = "telegram"
): Promise<{ reply: string; tool: string }> {
    const tool = command.name;
    let venue = null;
    if ("venue" in command) {
        const choice = await resolveVenue(supabase, command.venue);
        if ("none" in choice) return { reply: noVenueText(command.venue), tool };
        if ("many" in choice) return { reply: manyVenuesText(command.venue, choice.many), tool };
        venue = choice.venue;
    }

    if (command.name === "add_note") {
        await rpc(supabase, "crm_gea_add_note", { p_venue_id: venue.id, p_text: command.text, p_actor_user_id: actor.user_id });
        await rpc(supabase, "crm_gea_log", {
            p_actor_user_id: actor.user_id, p_action: "gea_note",
            p_reason: diaryReason(command, actor.display_name, venue.name), p_venue_id: venue.id
        });
        return { reply: commandDoneText(command, venue.name), tool };
    }

    if (command.name === "move_stage") {
        if (isStopLocked(venue, command.stage)) return { reply: stopLockedText(venue.name), tool };
        const changed = await rpc(supabase, "crm_move_stage", {
            p_venue_id: venue.id, p_stage: command.stage, p_actor_user_id: actor.user_id
        });
        if (!changed) return { reply: commandNoopText(command, venue.name), tool };
        await rpc(supabase, "crm_gea_log", {
            p_actor_user_id: actor.user_id, p_action: "gea_move_stage",
            p_reason: diaryReason(command, actor.display_name, venue.name), p_venue_id: venue.id,
            p_payload: { from: venue.stage, to: command.stage }
        });
        return { reply: commandDoneText(command, venue.name), tool };
    }

    if (command.name === "assign") {
        const person = choosePerson(team, command.person);
        if (!person) return { reply: `Non trovo «${command.person}» nel team: ${team.map(m => m.display_name).join(", ")}.`, tool };
        if (venue.assigned_to === person.display_name) return { reply: commandNoopText(command, venue.name, person.display_name), tool };
        const changed = await rpc(supabase, "crm_assign", {
            p_venue_id: venue.id, p_user_id: person.user_id, p_actor_user_id: actor.user_id
        });
        if (!changed) return { reply: commandNoopText(command, venue.name, person.display_name), tool };
        await rpc(supabase, "crm_gea_log", {
            p_actor_user_id: actor.user_id, p_action: "gea_assign",
            p_reason: diaryReason(command, actor.display_name, venue.name, person.display_name), p_venue_id: venue.id
        });
        // I messaggi del lead su Telegram dicono a chi è: si riscrivono.
        await refreshVenueMessages(supabase, botToken, venue.id, appUrl);
        return { reply: commandDoneText(command, venue.name, person.display_name), tool };
    }

    if (command.name === "pause_agents" || command.name === "resume_agents") {
        const on = command.name === "pause_agents";
        const changed = await rpc(supabase, "crm_set_brake", {
            p_on: on,
            p_reason: on ? `Gea, chiesto da ${actor.display_name}: ${command.reason}` : null,
            p_source: channel,
            p_actor_user_id: actor.user_id
        });
        if (!changed) return { reply: commandNoopText(command), tool };
        await rpc(supabase, "crm_gea_log", {
            p_actor_user_id: actor.user_id, p_action: on ? "gea_pause" : "gea_resume",
            p_reason: diaryReason(command, actor.display_name)
        });
        return { reply: commandDoneText(command), tool };
    }

    return { reply: GEA_TEXT.notUnderstood, tool };
}

// -----------------------------------------------------------------------------
// Il giro di un messaggio
// -----------------------------------------------------------------------------
// Esportata per crm-gea-web: stesso giro, la risposta torna al pannello di /admin.
export async function think(
    supabase, botToken, text: string, actor, team, appUrl, now: Date, history: GeaTurn[], channel: GeaChannel = "telegram"
): Promise<Outcome> {
    if (text.length > GEA_MAX_INPUT) return { status: "answered", reply: GEA_TEXT.tooLong, costUsd: 0 };

    const request = buildUnderstandRequest({
        text,
        askerName: actor.display_name,
        teamNames: team.map(m => m.display_name),
        now,
        history
    });
    const res = await callCrmClaude(supabase, { role: "gea", ...request, maxTokens: 300 });
    if (!res.ok) return { status: "failed", reply: claudeFailText(res.reason), costUsd: 0, error: `understand: ${res.reason}` };

    const understood = parseUnderstanding(res.text);
    const cost = res.costUsd;
    if ("invalid" in understood) {
        return { status: "answered", intent: "other", reply: GEA_TEXT.notUnderstood, costUsd: cost, error: understood.invalid };
    }

    switch (understood.intent) {
        case "other":
            return { status: "answered", intent: "other", reply: understood.reply.replace(/\s*—\s*/g, ", "), costUsd: cost };
        case "message_lead":
            return { status: "answered", intent: "message_lead", reply: GEA_TEXT.messageLead, costUsd: cost };
        case "refuse":
            await rpc(supabase, "crm_gea_log", {
                p_actor_user_id: actor.user_id, p_action: "gea_refused",
                p_reason: `Rifiutato a ${actor.display_name}: ${understood.reason}`
            });
            return { status: "refused", intent: "refuse", reply: refuseText(understood.reason), costUsd: cost };
        case "today": {
            const data = await rpc(supabase, "crm_gea_today");
            return {
                status: "answered", intent: "today", tool: "today",
                reply: `${buildTodayText(data, now)}\n\n${sourceLine("today", now)}`, costUsd: cost
            };
        }
        case "question": {
            const out = await answerReads(deps(supabase, team), {
                question: text, reads: understood.reads, now, askerName: actor.display_name, history
            });
            return {
                status: out.error && !out.error.startsWith("missing") ? "failed" : "answered",
                intent: "question", tool: out.tool, reply: out.reply, costUsd: out.costUsd + cost, error: out.error
            };
        }
        case "write": {
            const out = await writeText(deps(supabase, team), {
                brief: understood.brief, venue: understood.venue, now, askerName: actor.display_name,
                brandRules: await brandRules(supabase), history
            });
            return {
                status: out.error ? "failed" : "answered",
                intent: "write", tool: "write", reply: out.reply, costUsd: out.costUsd + cost, error: out.error
            };
        }
        case "command": {
            if (needsConfirmation(understood.command)) {
                const { data: settings } = await supabase.from("crm_settings").select("agent_autonomy_on").maybeSingle();
                return {
                    status: "pending", intent: "command", tool: understood.command.name,
                    reply: confirmQuestionText(understood.command, settings?.agent_autonomy_on === true),
                    costUsd: cost, pending: understood.command
                };
            }
            if (understood.command.name === "move_stage") {
                const choice = await resolveVenue(supabase, understood.command.venue);
                if ("venue" in choice && !isStopLocked(choice.venue, understood.command.stage)
                    && moveNeedsConfirmation(choice.venue, understood.command.stage)) {
                    return {
                        status: "pending", intent: "command", tool: "move_stage",
                        reply: moveConfirmText(choice.venue.name, choice.venue.stage, understood.command.stage),
                        costUsd: cost, pending: understood.command
                    };
                }
            }
            const done = await runCommand(supabase, botToken, understood.command, actor, team, appUrl, channel);
            return { status: "answered", intent: "command", tool: done.tool, reply: done.reply, costUsd: cost };
        }
    }
}

export async function handleGeaMessage(supabase, botToken: string, message, actor, team, appUrl: string | null): Promise<void> {
    const chatId = message.chat.id;
    const isVoice = !!(message.voice || message.audio || message.video_note);
    const text = typeof message.text === "string" ? message.text.trim() : "";
    if (!isVoice && !text) return;

    const { data: inboxId, error } = await supabase.rpc("crm_gea_receive", {
        p_user_id: actor.user_id,
        p_source: isVoice ? "telegram_voice" : "telegram_text",
        p_chat_id: chatId,
        p_message_id: message.message_id,
        p_body: isVoice ? null : text
    });
    if (error) {
        console.error("crmGea: receive", error.code, error.message);
        return;
    }
    if (!inboxId) return; // Telegram ha ripetuto l'update: già gestito

    if (isVoice) {
        await telegramCall(botToken, "sendMessage", { chat_id: chatId, text: GEA_TEXT.voice, reply_to_message_id: message.message_id });
        return;
    }

    const { data: claimed } = await supabase.rpc("crm_gea_claim", { p_id: inboxId });
    if (!claimed) return;
    await telegramCall(botToken, "sendChatAction", { chat_id: chatId, action: "typing" });

    let out: Outcome;
    try {
        const now = new Date();
        const history = await recentTurns(supabase, actor.user_id, inboxId, now);
        out = await think(supabase, botToken, text, actor, team, appUrl, now, history);
    } catch (err) {
        console.error("crmGea: giro", err?.fn ?? "", err?.code ?? "", err?.message ?? String(err));
        out = { status: "failed", reply: GEA_TEXT.failed, costUsd: 0, error: `${err?.fn ?? "giro"}: ${err?.code ?? err?.message ?? "errore"}` };
    }

    const finish = (telegramError: string | null) =>
        supabase.rpc("crm_gea_finish", {
            p_id: inboxId,
            p_status: out.status,
            p_intent: out.intent ?? null,
            p_tool: out.tool ?? null,
            p_reply: out.reply,
            p_cost_usd: out.costUsd,
            p_error: out.error ?? telegramError,
            p_pending: out.pending ?? null
        });
    // In attesa di conferma la riga va chiusa prima di mandare i tasti: un
    // tocco immediato deve trovarla già 'pending'.
    if (out.status === "pending") {
        const { error: pendingError } = await finish(null);
        if (pendingError) {
            console.error("crmGea: finish", pendingError.code, pendingError.message);
            out = { status: "failed", reply: GEA_TEXT.failed, costUsd: 0 };
            await telegramCall(botToken, "sendMessage", { chat_id: chatId, text: out.reply, reply_to_message_id: message.message_id });
            return;
        }
    }

    const sent = await telegramCall(botToken, "sendMessage", {
        chat_id: chatId,
        text: out.reply,
        reply_to_message_id: message.message_id,
        ...(out.status === "pending"
            ? {
                  reply_markup: {
                      inline_keyboard: [[
                          { text: confirmButtonLabels(out.pending as GeaCommand).yes, callback_data: encodeGeaConfirm(inboxId, true) },
                          { text: confirmButtonLabels(out.pending as GeaCommand).no, callback_data: encodeGeaConfirm(inboxId, false) }
                      ]]
                  }
              }
            : {})
    });
    if (!sent.ok) console.error("crmGea: risposta non mandata", sent.description);
    if (out.status === "pending") return;

    const { error: finishError } = await finish(sent.ok ? null : `telegram: ${sent.description ?? "errore"}`);
    if (finishError) console.error("crmGea: finish", finishError.code, finishError.message);
}

// -----------------------------------------------------------------------------
// Tasto di conferma (gruppo 2)
// -----------------------------------------------------------------------------
export async function handleGeaConfirm(supabase, botToken: string, parsed, actor, team, query, answer, appUrl: string | null): Promise<void> {
    const { data: command, error } = await supabase.rpc("crm_gea_confirm", {
        p_id: parsed.inboxId,
        p_actor_user_id: actor.user_id
    });
    if (error) {
        console.error("crmGea: confirm", error.code, error.message);
        await answer("Non ci sono riuscita. Riprova.");
        return;
    }
    if (!command) {
        await answer("Già deciso, scaduto (vale 30 minuti) o chiesto da un'altra persona.");
        return;
    }

    let reply: string;
    let status = "answered";
    let errText = null;
    if (!parsed.accept) {
        reply = "Va bene, lascio com'è.";
    } else {
        try {
            reply = (await runCommand(supabase, botToken, command, actor, team, appUrl)).reply;
        } catch (err) {
            console.error("crmGea: comando confermato", err?.fn ?? "", err?.code ?? "", err?.message ?? String(err));
            reply = GEA_TEXT.failed;
            status = "failed";
            errText = `${err?.fn ?? "comando"}: ${err?.code ?? "errore"}`;
        }
    }

    const { error: finishError } = await supabase.rpc("crm_gea_finish", {
        p_id: parsed.inboxId, p_status: status, p_reply: reply, p_error: errText
    });
    if (finishError) console.error("crmGea: finish dopo conferma", finishError.code, finishError.message);
    await telegramCall(botToken, "editMessageText", {
        chat_id: query.message?.chat?.id,
        message_id: query.message?.message_id,
        text: `${query.message?.text ?? ""}\n\n${reply}`.trim()
    });
    await answer(parsed.accept ? "Fatto." : "");
}
