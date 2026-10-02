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
//   * tocco su «Lo prendo io» / «Gira a <nome>» → crm_assign con l'autore del
//     tocco come attore, poi riscrive i messaggi di tutti per quel locale
//     («Preso da <nome>», pulsanti invertiti);
//   * «Gira a…» (più di due persone) → mostra la scelta tra i nomi;
//     «Annulla» la richiude.
//   * «È lo stesso locale» / «Decido dopo» su un lead tornato con un altro
//     nome del locale → crm_resolve_venue_name, riscrive i messaggi e
//     conferma cosa ha fatto (mig 20261002130000).
// Chi tocca è riconosciuto dal suo id Telegram, che in chat privata coincide
// col chat_id salvato al collegamento. Chi non è nel team non può fare nulla.
//
// Risponde sempre 200 a Telegram dopo l'autenticazione: un errore farebbe
// ripetere l'update all'infinito.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN,
// TELEGRAM_WEBHOOK_SECRET, APP_URL (facoltativo).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualStr } from "../_shared/timingSafeEqual.ts";
import { getPublicSiteUrl } from "../_shared/publicSiteUrl.ts";
import { telegramCall } from "../_shared/telegramApi.ts";
import { chooseButtons, parseCallbackData } from "../_shared/crmTelegram.ts";
import { CRM_STAGE_LABEL } from "../_shared/crmLabels.ts";
import { loadTeam, refreshVenueMessages } from "../_shared/crmLeadMessage.ts";

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
 * «È lo stesso locale» / «Decido dopo» su un lead tornato con un altro nome
 * del locale: crm_resolve_venue_name, poi riscrive i messaggi del locale e
 * conferma cosa ha fatto.
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

    const choice = parsed.action === "venue_same" ? "same" : "later";
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
    // L'etichetta segue la richiesta più recente: su una più vecchia la scelta
    // resta scritta ma l'etichetta no (crm_refresh_name_to_verify).
    const { data: venue } = await supabase
        .from("crm_venues")
        .select("name_to_verify")
        .eq("id", lead.venue_id)
        .maybeSingle();
    await answer(
        venue?.name_to_verify
            ? `Ok, ho messo l'etichetta «Locale da verificare» su ${known}.`
            : `Ok, segnato. Su ${known} c'è una richiesta più recente da decidere nella scheda.`
    );
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

    if (parsed.action === "venue_same" || parsed.action === "venue_later") {
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
        }
    } catch (err) {
        const e = err as { code?: unknown; message?: unknown };
        console.error("crm-telegram-webhook: error", e?.code ?? "", e?.message ?? String(err));
    }
    return ok();
});
