// Agente in prova (F1-3): i messaggi Telegram delle bozze, puri.
//
// Ogni bozza va ad Alex e Lorenzo con i tasti del suo tipo. Chi tocca per
// primo decide; agli altri il messaggio si chiude con chi ha deciso e cosa.
// Lo usano l'edge crm-agent e crm-telegram-webhook.

import {
    encodeDraftDecision,
    escapeHtml,
    type CrmDraftDecision,
    type InlineButton,
    type TelegramMessage
} from "./crmTelegram.ts";
import { formatCallDay, formatCallTime } from "./crmCallSlots.ts";

export type AgentDraftKind = "reply" | "follow_up" | "bot_question" | "ask" | "schedule" | "stop_check";

export interface AgentDraftInfo {
    draftId: string;
    venueId: string;
    kind: AgentDraftKind;
    venueName: string;
    contactName: string | null;
    proposedText: string | null;
    reason: string | null;
    proposedStartsAt: string | null;
    followUpNumber: number | null;
    /** Gli ultimi messaggi della chat, dal più vecchio. */
    lastMessages: { from: "lead" | "noi"; text: string }[];
}

const MAX_QUOTE = 400;
/** Oltre questi messaggi la chat va in un riquadro chiuso, che si apre col tocco. */
const INLINE_MESSAGES = 3;
/** Telegram rifiuta i messaggi oltre 4096 caratteri: si resta sotto, contando anche i tag. */
const MAX_MESSAGE_LENGTH = 4000;

function clip(text: string, max = MAX_QUOTE): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function who(info: AgentDraftInfo): string {
    return `<b>${escapeHtml(info.venueName)}</b>${info.contactName ? ` (${escapeHtml(info.contactName)})` : ""}`;
}

function when(iso: string): string {
    const d = new Date(iso);
    return `${formatCallDay(d)} alle ${formatCallTime(d)}`;
}

function title(info: AgentDraftInfo): string {
    switch (info.kind) {
        case "reply":
            return `✍️ Bozza di risposta per ${who(info)}`;
        case "follow_up":
            return `🔁 Follow-up${info.followUpNumber ? ` n. ${info.followUpNumber}` : ""} per ${who(info)}: non risponde`;
        case "bot_question":
            return `🤖 ${who(info)} chiede se è un bot. Rispondete voi: ecco una proposta`;
        case "ask":
            return `🙋 Serve una persona per ${who(info)}`;
        case "schedule":
            return `📞 ${who(info)} ha accettato ${info.proposedStartsAt ? when(info.proposedStartsAt) : "un orario"}`;
        case "stop_check":
            return `✋ Stop o obiezione? ${who(info)}`;
    }
}

function keyboard(info: AgentDraftInfo, appUrl: string | null): InlineButton[][] {
    const b = (text: string, decision: CrmDraftDecision): InlineButton => ({
        text,
        callback_data: encodeDraftDecision(info.draftId, decision)
    });
    const rows: InlineButton[][] = [];
    switch (info.kind) {
        case "stop_check":
            rows.push([b("È uno stop", "stop"), b("È un'obiezione", "objection")]);
            break;
        case "schedule":
            rows.push([b("Va bene, fissala", "schedule"), b("Proponi altro", "other")]);
            rows.push([b("Lo gestisco io", "handle")]);
            break;
        default:
            if (info.proposedText) {
                rows.push([b("Invia così", "send")]);
                rows.push([b("Lo correggo io", "edit")]);
            } else {
                rows.push([b("Scrivo io la risposta", "edit")]);
            }
            rows.push([b("Non mandare", "discard"), b("Lo gestisco io", "handle")]);
    }
    if (appUrl) rows.push([{ text: "Apri la scheda", url: `${appUrl}/admin/lead/${info.venueId}` }]);
    return rows;
}

function chatLines(messages: AgentDraftInfo["lastMessages"]): string[] {
    return messages.map(m => `${m.from === "lead" ? "Lead" : "Noi"}: ${escapeHtml(clip(m.text))}`);
}

function composeDraftText(info: AgentDraftInfo, messages: AgentDraftInfo["lastMessages"]): string {
    const lines = [title(info)];
    if (info.reason && info.kind !== "follow_up") lines.push(`Perché: ${escapeHtml(info.reason)}`);
    const collapsed = messages.length > INLINE_MESSAGES;
    if (messages.length && !collapsed) lines.push("", ...chatLines(messages));
    if (info.proposedText) {
        lines.push("", info.kind === "schedule" ? "<b>Conferma al lead</b> (parte con la conferma dell'agenda):" : "<b>Proposta</b>:");
        lines.push(`<i>${escapeHtml(info.proposedText)}</i>`);
    }
    if (collapsed) {
        lines.push("", `💬 La chat, ultimi ${messages.length} messaggi (tocca per aprirla):`);
        lines.push(`<blockquote expandable>${chatLines(messages).join("\n")}</blockquote>`);
    }
    if (info.kind === "stop_check") lines.push("", "Finché non scegliete, l'agente non scrive.");
    return lines.join("\n");
}

export function buildDraftMessage(info: AgentDraftInfo, appUrl: string | null): TelegramMessage {
    // Se il testo è troppo lungo per Telegram, cadono per primi i messaggi più vecchi della chat.
    let messages = info.lastMessages;
    let text = composeDraftText(info, messages);
    while (text.length > MAX_MESSAGE_LENGTH && messages.length) {
        messages = messages.slice(1);
        text = composeDraftText(info, messages);
    }
    return { text, reply_markup: { inline_keyboard: keyboard(info, appUrl) } };
}

export const DRAFT_OUTCOME_LABEL: Record<string, string> = {
    sent: "inviata così",
    edited: "inviata con le correzioni",
    discarded: "non mandata",
    scheduled: "telefonata fissata",
    handled: "gestita da una persona",
    expired: "scaduta: il lead ha scritto ancora"
};

/** Il messaggio chiuso, senza tasti: chi ha deciso e cosa. */
export function buildDraftClosedText(info: AgentDraftInfo, status: string, actorName: string | null): string {
    const label = DRAFT_OUTCOME_LABEL[status] ?? status;
    const by = actorName ? ` (${escapeHtml(actorName)})` : "";
    const text = info.proposedText ? `\n<i>${escapeHtml(clip(info.proposedText, 200))}</i>` : "";
    return `${title(info)}\n➡️ ${escapeHtml(label)}${by}${text}`;
}

export function buildEditPromptText(info: AgentDraftInfo): string {
    return `Scrivi qui il messaggio per ${info.venueName}${info.contactName ? ` (${info.contactName})` : ""}, rispondendo a questo messaggio. Parte così com'è.`;
}

export function buildReminderText(info: AgentDraftInfo, minutes: number): string {
    return `⏰ Ancora in attesa da ${minutes} minuti: ${info.kind === "stop_check" ? "stop o obiezione" : "bozza"} per ${info.venueName}.`;
}

/** Testo scritto in risposta alla richiesta di correzione: pulito e nei limiti. */
export function cleanEditText(raw: string | null | undefined): string | null {
    const text = (raw ?? "").replace(/\r/g, "").trim();
    if (!text || text.length > 1000) return null;
    return text;
}
