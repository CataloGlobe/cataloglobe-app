// @ts-nocheck
// =============================================================================
// crm-telegram-webhook — il bot del CRM riceve messaggi e tocchi sui pulsanti
// =============================================================================
//
// Registrato con setWebhook + secret_token: Telegram manda l'header
// X-Telegram-Bot-Api-Secret-Token, confrontato constant-time con
// TELEGRAM_WEBHOOK_SECRET. Senza segreto configurato: 401 (fail-closed).
//
// Cosa gestisce:
//   * "/start <token>" in chat privata → collega la chat a chi ha generato il
//     token in /admin (crm_start_telegram_link, valido 15 minuti);
//   * tocco su «Lo prendo io» / «Assegnalo a <nome>» → crm_assign con
//     l'autore del tocco come attore, poi riscrive i messaggi di tutti per
//     quel locale («Preso da <nome>», pulsanti invertiti);
//   * «Assegnalo a un'altra persona…» (più di due) → mostra la scelta tra i
//     nomi; «Annulla» la richiude.
//   * «Stesso locale: tieni …» / «Stesso locale: chiamalo …» su un lead
//     tornato con un altro nome del locale → crm_resolve_venue_name ('same' /
//     'rename', mig 20261002230000), riscrive i messaggi e conferma cosa ha
//     fatto. «Decido dopo» ('later') arriva solo da messaggi vecchi.
//   * agenda (F1-4a): «Sì, chiamo io» / «No, non posso» → crm_answer_call
//     (solo chi deve chiamare; se dice no, avvisa chi l'ha fissata); «Fatta» /
//     «Non ha risposto» / «Rimandata» → crm_set_call_outcome. Il messaggio
//     perde i pulsanti e dice cosa è successo.
//   * agente in prova (F1-3): tasti delle bozze → crm_agent_decide_draft;
//     «Lo correggo io» manda una risposta forzata, e il testo scritto in
//     risposta a quel messaggio va in coda al posto della bozza. Decisa una
//     bozza, i messaggi di tutti perdono i tasti e dicono chi ha deciso.
//   * Gea 1 (F1-8): ogni altro messaggio in chat privata da una persona del
//     team va a Gea (_shared/crmGeaJob.ts), in sottofondo con
//     EdgeRuntime.waitUntil: Telegram riceve 200 subito. «Sì, fallo» / «No»
//     sui comandi del gruppo 2 → crm_gea_confirm (solo chi l'ha chiesto).
// Chi tocca è riconosciuto dal suo id Telegram, che in chat privata coincide
// col chat_id salvato al collegamento. Chi non è nel team non può fare nulla.
//
// Risponde sempre 200 a Telegram dopo l'autenticazione: un errore farebbe
// ripetere l'update all'infinito.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN,
// TELEGRAM_WEBHOOK_SECRET, CRM_ANTHROPIC_API_KEY (Gea; senza, Gea risponde
// che il collegamento con Claude non va), APP_URL (facoltativo).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualStr } from "../_shared/timingSafeEqual.ts";
import { getPublicSiteUrl } from "../_shared/publicSiteUrl.ts";
import { telegramCall } from "../_shared/telegramApi.ts";
import { chooseButtons, parseCallbackData } from "../_shared/crmTelegram.ts";
import { CRM_STAGE_LABEL } from "../_shared/crmLabels.ts";
import { loadTeam, refreshVenueMessages } from "../_shared/crmLeadMessage.ts";
import { loadAppointment, syncAppointmentGoogle, toCallInfo } from "../_shared/crmAgendaJob.ts";
import { CALL_OUTCOME_LABEL, buildAnsweredText, buildCallerDeclinedText } from "../_shared/crmAgendaMessages.ts";
import { sendToTeam } from "../_shared/crmTeamAlert.ts";
import { closeDraftMessages } from "../_shared/crmAgentJob.ts";
import { buildEditPromptText, cleanEditText } from "../_shared/crmAgentMessages.ts";
import { handleGeaConfirm, handleGeaMessage } from "../_shared/crmGeaJob.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ok(): Response {
    return new Response("ok", { status: 200 });
}

async function reply(chatId: number, text: string) {
    await telegramCall(BOT_TOKEN, "sendMessage", { chat_id: chatId, text });
}

async function handleStart(supabase, message) {
    const chatId = message.chat?.id;
    if (message.chat?.type !== "private" || !chatId) return;

    const token = String(message.text ?? "").trim().split(/\s+/)[1] ?? "";
    if (!UUID_RE.test(token)) {
        await reply(chatId, "Per collegarti apri il link «Collega Telegram» da /admin/lead.");
        return;
    }

    const { data: member, error } = await supabase
        .from("crm_team_members")
        .select("user_id, display_name, telegram_link_expires_at")
        .eq("telegram_link_token", token)
        .maybeSingle();
    if (error) throw error;

    if (!member || !member.telegram_link_expires_at || new Date(member.telegram_link_expires_at) < new Date()) {
        await reply(chatId, "Link scaduto o già usato. Generane uno nuovo da /admin/lead.");
        return;
    }

    // Una chat appartiene a una persona sola: se era di qualcun altro, si stacca.
    await supabase
        .from("crm_team_members")
        .update({ telegram_chat_id: null })
        .eq("telegram_chat_id", chatId)
        .neq("user_id", member.user_id);

    // Il token si consuma nello stesso update: due /start insieme, uno solo passa.
    const { data: linked, error: updateError } = await supabase
        .from("crm_team_members")
        .update({ telegram_chat_id: chatId, telegram_link_token: null, telegram_link_expires_at: null })
        .eq("user_id", member.user_id)
        .eq("telegram_link_token", token)
        .gt("telegram_link_expires_at", new Date().toISOString())
        .select("user_id");
    if (updateError) throw updateError;
    if (!linked || linked.length === 0) {
        await reply(chatId, "Link scaduto o già usato. Generane uno nuovo da /admin/lead.");
        return;
    }

    await reply(chatId, `Collegato come ${member.display_name}. Da ora i lead nuovi arrivano qui.`);
}

/**
 * Scelta sul nome di un lead tornato con un altro nome del locale:
 * crm_resolve_venue_name, poi riscrive i messaggi del locale e conferma cosa
 * ha fatto.
 */
async function handleVenueName(supabase, parsed, actor, answer, appUrl) {
    const { data: lead, error: leadError } = await supabase
        .from("crm_leads")
        .select("id, venue_id, venue_name_given, crm_venues(name, stage)")
        .eq("id", parsed.leadId)
        .maybeSingle();
    if (leadError) throw leadError;
    if (!lead) {
        await answer("Questo lead non c'è più.");
        return;
    }

    const choice =
        parsed.action === "venue_same" ? "same" : parsed.action === "venue_rename" ? "rename" : "later";
    const { error } = await supabase.rpc("crm_resolve_venue_name", {
        p_lead_id: lead.id,
        p_choice: choice,
        p_actor_user_id: actor.user_id
    });
    if (error) {
        console.error("crm-telegram-webhook: crm_resolve_venue_name", error.code, error.message);
        // Lead entrato prima di una rinomina: il nome è già stato deciso nella
        // scheda. SQLSTATE dedicato (migration 20261002155000).
        await answer(
            error.code === "VN001"
                ? "Il nome del locale è già stato sistemato nella scheda."
                : "Non ci sono riuscito. Riprova da /admin."
        );
        return;
    }

    await refreshVenueMessages(supabase, BOT_TOKEN, lead.venue_id, appUrl);
    const known = lead.crm_venues?.name ?? "il locale";
    const stage = CRM_STAGE_LABEL[lead.crm_venues?.stage] ?? lead.crm_venues?.stage ?? "";
    if (choice === "same") {
        await answer(`Ok, tengo ${known}. Resta in ${stage}.`);
        return;
    }
    if (choice === "rename") {
        await answer(`Ok, ora si chiama ${lead.venue_name_given}. Resta in ${stage}.`);
        return;
    }
    // «Decido dopo» da un messaggio vecchio: l'etichetta c'è già dall'arrivo
    // del lead (mig 20261002230000).
    await answer(`Ok, su ${known} resta l'etichetta «Locale da verificare».`);
}

/** Toglie i pulsanti e scrive l'esito al posto del messaggio. */
async function closeMessage(query, text: string) {
    const chatId = query.message?.chat?.id;
    const messageId = query.message?.message_id;
    if (!chatId || !messageId) return;
    await telegramCall(BOT_TOKEN, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
    });
}

const CALL_ERRORS: Record<string, string> = {
    CL003: "L'orario è già passato: fissane un altro dalla scheda.",
    CL004: "Questa telefonata non è più attiva.",
    CL006: "Può rispondere solo chi deve chiamare.",
    P0002: "Questa telefonata non c'è più."
};

async function handleCall(supabase, parsed, actor, team, answer, query, appUrl) {
    const row = await loadAppointment(supabase, parsed.appointmentId);
    if (!row) {
        await answer("Questa telefonata non c'è più.");
        return;
    }
    const info = toCallInfo(row, team);

    if (parsed.action === "call_answer") {
        const { data: status, error } = await supabase.rpc("crm_answer_call", {
            p_appointment_id: row.id,
            p_accept: parsed.accept,
            p_actor_user_id: actor.user_id
        });
        if (error) {
            console.error("crm-telegram-webhook: crm_answer_call", error.code, error.message);
            await answer(CALL_ERRORS[error.code] ?? "Non ci sono riuscito. Riprova dalla scheda.");
            return;
        }
        if (status === null) {
            await answer("Già deciso.");
            await closeMessage(query, buildAnsweredText(info, "già decisa"));
            return;
        }
        if (status === "confirmed") {
            await closeMessage(query, buildAnsweredText(info, `la fai tu, ${actor.display_name}. Al lead parte la conferma.`));
            await answer("Confermata.");
            try {
                await syncAppointmentGoogle(supabase, row.id, team, appUrl);
            } catch (err) {
                console.error("crm-telegram-webhook: Google", (err as Error)?.message);
            }
            return;
        }
        await closeMessage(query, buildAnsweredText(info, "annullata, non puoi."));
        await answer("Ok, annullata.");
        await sendToTeam(supabase, buildCallerDeclinedText(info), {
            preferUserIds: [row.created_by],
            logTag: "crm-telegram-webhook"
        });
        return;
    }

    const { data: changed, error } = await supabase.rpc("crm_set_call_outcome", {
        p_appointment_id: row.id,
        p_outcome: parsed.outcome,
        p_actor_user_id: actor.user_id
    });
    if (error) {
        console.error("crm-telegram-webhook: crm_set_call_outcome", error.code, error.message);
        await answer(CALL_ERRORS[error.code] ?? "Non ci sono riuscito. Riprova dalla scheda.");
        return;
    }
    const label = CALL_OUTCOME_LABEL[parsed.outcome];
    await closeMessage(query, buildAnsweredText(info, changed ? `${label} (${actor.display_name})` : "esito già segnato"));
    await answer(changed ? "Segnato." : "Era già segnato.");
}

const DRAFT_ERRORS: Record<string, string> = {
    P0002: "Questa bozza non c'è più.",
    CL001: "Chi chiama ha già un'altra telefonata a quell'ora: fissala dalla scheda.",
    CL002: "C'è già una telefonata fissata per questo locale.",
    CL003: "L'orario è già passato.",
    CL005: "Il locale è in Perso.",
    AG001: "Il locale ha cambiato fase nel frattempo: non ho fatto niente.",
    "42501": "Non puoi decidere questa bozza."
};

async function handleDraft(supabase, parsed, actor, answer, query) {
    const { data: draft } = await supabase
        .from("crm_agent_drafts")
        .select("id, status, venue_id, kind, proposed_text, crm_venues(name), crm_contacts(name)")
        .eq("id", parsed.draftId)
        .maybeSingle();
    if (!draft) {
        await answer("Questa bozza non c'è più.");
        return;
    }
    if (parsed.decision === "wrong") {
        const { data: status, error } = await supabase.rpc("crm_agent_decide_draft", {
            p_draft_id: draft.id,
            p_decision: "wrong",
            p_actor_user_id: actor.user_id
        });
        if (error) {
            await answer(DRAFT_ERRORS[error.code] ?? "Non ci sono riuscito.");
            return;
        }
        if (status && query.message?.chat?.id && query.message?.message_id) {
            await telegramCall(BOT_TOKEN, "editMessageReplyMarkup", {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                reply_markup: { inline_keyboard: [] }
            });
        }
        await answer(
            status === "wrong_stopped"
                ? "Segnata e fermata prima dell'invio: il tipo torna in approvazione per 3."
                : status
                  ? "Segnata: il tipo torna in approvazione per 3. Il messaggio era già partito."
                  : "Era già segnata."
        );
        return;
    }
    if (draft.status !== "pending") {
        await answer("Già decisa.");
        await closeDraftMessages(supabase, BOT_TOKEN, draft.id, draft.status, null);
        return;
    }
    if (parsed.decision === "edit") {
        // Risposta forzata: il testo scritto in risposta va in coda.
        const chatId = query.message?.chat?.id;
        const sent = await telegramCall(BOT_TOKEN, "sendMessage", {
            chat_id: chatId,
            text: buildEditPromptText({
                draftId: draft.id,
                venueId: draft.venue_id,
                kind: draft.kind,
                venueName: draft.crm_venues?.name ?? "il locale",
                contactName: draft.crm_contacts?.name ?? null,
                proposedText: draft.proposed_text,
                reason: null,
                proposedStartsAt: null,
                followUpNumber: null,
                lastMessages: []
            }),
            reply_markup: { force_reply: true, input_field_placeholder: "Il messaggio per il lead" }
        });
        if (sent.ok && sent.result?.message_id) {
            await supabase.from("crm_agent_draft_messages").insert({
                draft_id: draft.id,
                user_id: actor.user_id,
                chat_id: chatId,
                message_id: sent.result.message_id,
                role: "edit_prompt"
            });
            await answer("Scrivi il testo rispondendo al messaggio.");
        } else {
            await answer("Non ci sono riuscito. Riprova.");
        }
        return;
    }
    const { data: status, error } = await supabase.rpc("crm_agent_decide_draft", {
        p_draft_id: draft.id,
        p_decision: parsed.decision,
        p_actor_user_id: actor.user_id
    });
    if (error) {
        console.error("crm-telegram-webhook: crm_agent_decide_draft", error.code, error.message);
        await answer(DRAFT_ERRORS[error.code] ?? "Non ci sono riuscito. Riprova dalla scheda.");
        return;
    }
    await closeDraftMessages(supabase, BOT_TOKEN, draft.id, status ?? "handled", status ? actor.display_name : null);
    await answer(status === "expired" ? "Il locale è cambiato nel frattempo: bozza chiusa." : status ? "Fatto." : "Già decisa.");
}

/** Testo scritto in risposta a «Lo correggo io». */
/** true se il messaggio era la correzione di una bozza (gestito qui). */
async function handleEditReply(supabase, message): Promise<boolean> {
    const chatId = message.chat?.id;
    const replyTo = message.reply_to_message?.message_id;
    if (!chatId || !replyTo) return false;
    const { data: prompt } = await supabase
        .from("crm_agent_draft_messages")
        .select("draft_id")
        .eq("chat_id", chatId)
        .eq("message_id", replyTo)
        .eq("role", "edit_prompt")
        .maybeSingle();
    if (!prompt) return false;
    const team = await loadTeam(supabase);
    const actor = team.find(m => m.telegram_chat_id === message.from?.id);
    if (!actor) return true;
    const text = cleanEditText(message.text);
    if (!text) {
        await reply(chatId, "Il testo deve avere da 1 a 1000 caratteri. Rispondi di nuovo al messaggio.");
        return true;
    }
    const { data: status, error } = await supabase.rpc("crm_agent_decide_draft", {
        p_draft_id: prompt.draft_id,
        p_decision: "edit",
        p_text: text,
        p_actor_user_id: actor.user_id
    });
    if (error) {
        console.error("crm-telegram-webhook: correzione", error.code, error.message);
        await reply(chatId, DRAFT_ERRORS[error.code] ?? "Non ci sono riuscito. Riprova dalla scheda.");
        return true;
    }
    if (!status) {
        await reply(chatId, "La bozza era già stata decisa: il tuo testo non è partito.");
        return true;
    }
    await closeDraftMessages(supabase, BOT_TOKEN, prompt.draft_id, status, actor.display_name);
    await reply(chatId, "In coda: parte appena il canale WhatsApp può mandarlo.");
    return true;
}

/** Gea risponde solo in chat privata e solo a chi è nel team del CRM. */
async function handleGea(supabase, message, appUrl) {
    if (message.chat?.type !== "private") return;
    const team = await loadTeam(supabase);
    const actor = team.find(m => m.telegram_chat_id === message.from?.id);
    if (!actor) return;
    const work = handleGeaMessage(supabase, BOT_TOKEN, message, actor, team, appUrl).catch(err =>
        console.error("crm-telegram-webhook: Gea", err?.message ?? String(err))
    );
    // In sottofondo: Telegram riceve 200 subito, Gea può metterci qualche secondo.
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work);
    else await work;
}

async function handleCallback(supabase, query, appUrl) {
    const answer = (text: string) =>
        telegramCall(BOT_TOKEN, "answerCallbackQuery", { callback_query_id: query.id, text });

    const parsed = parseCallbackData(String(query.data ?? ""));
    if (!parsed) {
        await answer("Pulsante non valido.");
        return;
    }

    const team = await loadTeam(supabase);
    const actor = team.find(m => m.telegram_chat_id === query.from?.id);
    if (!actor) {
        await answer("Non sei nel team del CRM.");
        return;
    }

    const chatId = query.message?.chat?.id;
    const messageId = query.message?.message_id;

    if (parsed.action === "choose") {
        await telegramCall(BOT_TOKEN, "editMessageReplyMarkup", {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: chooseButtons(parsed.venueId, actor.user_id, team) }
        });
        await answer("A chi lo giri?");
        return;
    }

    if (parsed.action === "cancel") {
        await refreshVenueMessages(supabase, BOT_TOKEN, parsed.venueId, appUrl);
        await answer("");
        return;
    }

    if (parsed.action === "draft") {
        await handleDraft(supabase, parsed, actor, answer, query);
        return;
    }

    if (parsed.action === "gea_confirm") {
        await handleGeaConfirm(supabase, BOT_TOKEN, parsed, actor, team, query, answer, appUrl);
        return;
    }

    if (parsed.action === "call_answer" || parsed.action === "call_outcome") {
        await handleCall(supabase, parsed, actor, team, answer, query, appUrl);
        return;
    }

    if (parsed.action === "venue_same" || parsed.action === "venue_later" || parsed.action === "venue_rename") {
        await handleVenueName(supabase, parsed, actor, answer, appUrl);
        return;
    }

    const target = team.find(m => m.user_id === parsed.userId);
    if (!target) {
        await answer("Questa persona non è più nel team.");
        return;
    }

    const { error } = await supabase.rpc("crm_assign", {
        p_venue_id: parsed.venueId,
        p_user_id: target.user_id,
        p_actor_user_id: actor.user_id
    });
    if (error) {
        console.error("crm-telegram-webhook: crm_assign", error.code, error.message);
        await answer("Non sono riuscito ad assegnarlo. Riprova da /admin.");
        return;
    }

    await refreshVenueMessages(supabase, BOT_TOKEN, parsed.venueId, appUrl);
    await answer(target.user_id === actor.user_id ? "Preso." : `Girato a ${target.display_name}.`);
}

Deno.serve(async (req: Request) => {
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

    const provided = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (!WEBHOOK_SECRET || !provided || !timingSafeEqualStr(provided, WEBHOOK_SECRET)) {
        return new Response("unauthorized", { status: 401 });
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !BOT_TOKEN) {
        console.error("crm-telegram-webhook: env mancante");
        return ok();
    }

    let update;
    try {
        update = await req.json();
    } catch {
        return ok();
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    try {
        if (update.callback_query) {
            await handleCallback(supabase, update.callback_query, getPublicSiteUrl());
        } else if (typeof update.message?.text === "string" && update.message.text.startsWith("/start")) {
            await handleStart(supabase, update.message);
        } else if (update.message) {
            const handled =
                typeof update.message.text === "string" && update.message.reply_to_message
                    ? await handleEditReply(supabase, update.message)
                    : false;
            if (!handled) await handleGea(supabase, update.message, getPublicSiteUrl());
        }
    } catch (err) {
        const e = err as { code?: unknown; message?: unknown };
        console.error("crm-telegram-webhook: error", e?.code ?? "", e?.message ?? String(err));
    }
    return ok();
});
