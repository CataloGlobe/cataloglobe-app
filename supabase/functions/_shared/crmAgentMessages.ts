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

export type AgentDraftKind = "reply" | "follow_up" | "bot_question" | "ask" | "schedule" | "stop_check" | "lost_proposal" | "reactivation";

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
    /** Chi farà la telefonata, per le bozze `schedule`. */
    callerName?: string | null;
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
            return `🔁 Sollecito${info.followUpNumber ? ` n. ${info.followUpNumber}` : ""} per ${who(info)}: non risponde`;
        case "bot_question":
            return `🤖 ${who(info)} chiede se parla con un robot o con una persona. Decidete voi: ecco una proposta`;
        case "ask":
            return `🙋 Serve una persona per ${who(info)}`;
        case "schedule": {
            const at = info.proposedStartsAt ? when(info.proposedStartsAt) : "un orario";
            const caller = info.callerName ? ` Chiama ${escapeHtml(info.callerName)}.` : "";
            return `📞 ${who(info)} ha accettato ${at}.${caller}`;
        }
        case "stop_check":
            return `✋ Ho un dubbio su ${who(info)}`;
        case "lost_proposal":
            return `🪦 ${who(info)} non risponde da 10 solleciti. Lo mettiamo in Perso?`;
        case "reactivation":
            return `🌱 Riproviamo con ${who(info)}?`;
    }
}

/** Il dubbio della bozza `stop_check`: la frase del lead e le due letture possibili. */
function stopCheckLines(info: AgentDraftInfo): string[] {
    const last = [...info.lastMessages].reverse().find(m => m.from === "lead");
    const lines: string[] = [];
    if (last) lines.push(`${escapeHtml(info.contactName ?? "Il lead")} ha scritto: «${escapeHtml(clip(last.text))}»`);
    lines.push("Non so se è uno <b>stop</b> (non vuole più messaggi) o un <b>«non adesso»</b> (più avanti magari sì).");
    return lines;
}

const LOST_PROPOSAL_LINE = "In Perso l'agente smette di scrivergli. Se ricompila il modulo, vi arriva un avviso.";

const MONTHS = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"
];

/**
 * Contesto della riattivazione: «A maggio aveva detto «…». È in Perso da 4
 * mesi.» `lastIn` = l'ultimo messaggio del lead prima di Perso, se c'è.
 */
export function reactivationReason(
    lastIn: { body: string; createdAt: string } | null,
    lostSince: string,
    now: Date
): string {
    const since = new Date(lostSince);
    const months = Math.max(
        1,
        (now.getUTCFullYear() - since.getUTCFullYear()) * 12 + now.getUTCMonth() - since.getUTCMonth()
    );
    const time = months === 1 ? "da un mese" : `da ${months} mesi`;
    if (!lastIn) return `È in Perso ${time}.`;
    const said = new Date(lastIn.createdAt);
    const month = MONTHS[Number(said.toLocaleString("en-US", { timeZone: "Europe/Rome", month: "numeric" })) - 1];
    const body = lastIn.body.length > 200 ? `${lastIn.body.slice(0, 199)}…` : lastIn.body;
    const prefix = month === "aprile" || month === "agosto" || month === "ottobre" ? "Ad" : "A";
    return `${prefix} ${month} aveva detto «${body}». È in Perso ${time}.`;
}

function keyboard(info: AgentDraftInfo, appUrl: string | null): InlineButton[][] {
    const b = (text: string, decision: CrmDraftDecision): InlineButton => ({
        text,
        callback_data: encodeDraftDecision(info.draftId, decision)
    });
    const rows: InlineButton[][] = [];
    switch (info.kind) {
        case "stop_check":
            rows.push([b("È uno stop", "stop"), b("È un «non adesso»", "objection")]);
            break;
        case "schedule":
            rows.push([b("Fissa la telefonata", "schedule")]);
            rows.push([b("Proponi altri orari al lead", "other")]);
            rows.push([b("Scrivo io al lead", "handle")]);
            break;
        case "lost_proposal":
            rows.push([b("Sì, mettilo in Perso", "lost")]);
            rows.push([b("No, lascialo aperto", "discard"), b("Scrivo io al lead", "handle")]);
            break;
        default:
            if (info.proposedText) {
                rows.push([b("Invia questo messaggio", "send")]);
                rows.push([b("Modifico il testo", "edit"), b("Non mandare niente", "discard")]);
                rows.push([b("Scrivo io al lead", "handle")]);
            } else {
                rows.push([b("Scrivo io la risposta", "edit")]);
                rows.push([b("Non serve rispondere", "discard")]);
            }
    }
    if (appUrl) rows.push([{ text: "Apri la scheda", url: `${appUrl}/admin/lead/${info.venueId}` }]);
    return rows;
}

function chatLines(messages: AgentDraftInfo["lastMessages"]): string[] {
    return messages.map(m => `${m.from === "lead" ? "Lead" : "Noi"}: ${escapeHtml(clip(m.text))}`);
}

function composeDraftText(info: AgentDraftInfo, messages: AgentDraftInfo["lastMessages"]): string {
    const lines = [title(info)];
    if (info.kind === "stop_check") lines.push(...stopCheckLines(info));
    else if (info.kind === "lost_proposal") lines.push(LOST_PROPOSAL_LINE);
    // La riattivazione porta già la frase intera (reactivationReason).
    else if (info.kind === "reactivation" && info.reason) lines.push(escapeHtml(info.reason));
    else if (info.reason && info.kind !== "follow_up") lines.push(`Perché: ${escapeHtml(info.reason)}`);
    const collapsed = messages.length > INLINE_MESSAGES;
    if (messages.length && !collapsed) lines.push("", ...chatLines(messages));
    if (info.proposedText) {
        const lead = escapeHtml(info.contactName ?? "il lead");
        lines.push("", info.kind === "schedule" ? `<b>Conferma per ${lead}</b> (parte insieme alla telefonata in agenda):` : "<b>Proposta</b>:");
        lines.push(`<i>${escapeHtml(info.proposedText)}</i>`);
    }
    if (collapsed) {
        lines.push("", `💬 La chat, ultimi ${messages.length} messaggi (tocca per aprirla):`);
        lines.push(`<blockquote expandable>${chatLines(messages).join("\n")}</blockquote>`);
    }
    if (info.kind === "stop_check") lines.push("", "Finché non scegliete, l'agente non gli scrive.");
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
    handled: "ci pensa una persona: l'agente non gli scrive",
    expired: "scaduta: nel frattempo è cambiato qualcosa"
};

/**
 * Le decisioni che chiudono la bozza come `handled` si distinguono dal motivo
 * scritto dalla funzione SQL (crm_agent_decide_draft). ⚠️ SYNC con quei testi.
 */
const HANDLED_OUTCOME_BY_REASON: Record<string, string> = {
    "È uno stop.": "messo in Perso (stop): nessuno gli scrive più",
    "Obiezione, non stop.": "è un «non adesso»: resta aperto, l'agente prepara una risposta",
    "Proponi altri orari.": "l'agente propone altri orari al lead",
    "Messo in Perso.": "messo in Perso: l'agente non gli scrive più"
};

export function draftOutcomeLabel(status: string, reason: string | null, kind?: AgentDraftKind): string {
    // «No, lascialo aperto» sulla proposta di Perso: non c'era niente da mandare.
    if (status === "discarded" && kind === "lost_proposal") return "resta aperto: l'agente continua coi solleciti";
    if (status === "handled" && reason && HANDLED_OUTCOME_BY_REASON[reason]) return HANDLED_OUTCOME_BY_REASON[reason];
    return DRAFT_OUTCOME_LABEL[status] ?? status;
}

/** Il messaggio chiuso, senza tasti: chi ha deciso e cosa. */
export function buildDraftClosedText(info: AgentDraftInfo, status: string, actorName: string | null): string {
    const label = draftOutcomeLabel(status, info.reason, info.kind);
    const by = actorName ? ` (${escapeHtml(actorName)})` : "";
    const text = info.proposedText ? `\n<i>${escapeHtml(clip(info.proposedText, 200))}</i>` : "";
    return `${title(info)}\n➡️ ${escapeHtml(label)}${by}${text}`;
}

export function buildEditPromptText(info: AgentDraftInfo): string {
    return `Scrivi qui il messaggio per ${info.venueName}${info.contactName ? ` (${info.contactName})` : ""}, rispondendo a questo messaggio. Parte così com'è.`;
}

/** Quanti solleciti spettano a una bozza adesso (mai meno di quelli già mandati). */
export function remindersDue(notifiedAt: string, sent: number, now: Date, afterMinutes: number[]): number {
    const waited = (now.getTime() - new Date(notifiedAt).getTime()) / 60_000;
    return Math.max(sent, afterMinutes.filter(m => waited >= m).length);
}

function waitedLabel(minutes: number): string {
    if (minutes < 60) return `${minutes} minuti`;
    const h = Math.floor(minutes / 60);
    return h === 1 ? "più di un'ora" : `più di ${h} ore`;
}

/** Il sollecito: testo semplice (niente HTML), una bozza o tutte quelle in attesa. */
export function buildRemindersText(items: { info: AgentDraftInfo; minutes: number }[]): string {
    const label = (info: AgentDraftInfo) =>
        info.kind === "stop_check"
            ? "dubbio, stop o «non adesso»"
            : info.kind === "lost_proposal"
              ? "proposta di Perso"
              : info.kind === "reactivation"
                ? "riattivazione"
                : "bozza";
    if (items.length === 1) {
        const { info, minutes } = items[0];
        return `⏰ Ancora in attesa da ${waitedLabel(minutes)}: ${label(info)} per ${info.venueName}.`;
    }
    const lines = items.map(({ info, minutes }) => `• ${info.venueName}: ${label(info)}, da ${waitedLabel(minutes)}`);
    return `⏰ ${items.length} bozze aspettano da voi (le trovate più su in questa chat):\n${lines.join("\n")}`;
}

/** Testo scritto in risposta alla richiesta di correzione: pulito e nei limiti. */
export function cleanEditText(raw: string | null | undefined): string | null {
    const text = (raw ?? "").replace(/\r/g, "").trim();
    if (!text || text.length > 1000) return null;
    return text;
}

/**
 * Partita da sola (tipo fuori dalla prova, F1-7): si legge e, se non andava
 * bene, il tipo torna in prova. `whatsappUrl` è per destinatario (crm-wa).
 */
export function buildAutoSentMessage(
    info: AgentDraftInfo,
    appUrl: string | null,
    whatsappUrl: string | null = null
): TelegramMessage {
    const followUp = info.kind === "follow_up";
    const what = followUp ? "i solleciti tornano" : "le risposte tornano";
    const to = info.contactName ? `a ${escapeHtml(info.contactName)}` : "al lead";
    const compose = (messages: AgentDraftInfo["lastMessages"]): string => {
        const lines = [followUp ? `🤖 Ho mandato da solo un sollecito a ${who(info)}` : `🤖 Ho risposto da solo a ${who(info)}`];
        const collapsed = messages.length > INLINE_MESSAGES;
        if (messages.length && !collapsed) lines.push("", ...chatLines(messages));
        if (info.proposedText) lines.push("", "<b>Messaggio</b>:", `<i>${escapeHtml(info.proposedText)}</i>`);
        if (collapsed) {
            lines.push("", `💬 La chat, ultimi ${messages.length} messaggi (tocca per aprirla):`);
            lines.push(`<blockquote expandable>${chatLines(messages).join("\n")}</blockquote>`);
        }
        lines.push(
            "",
            `Se non andava bene, tocca il tasto: ${what} in prova e ti chiedo l'ok finché non ne approvi 3 di fila. ` +
                `Se non è ancora partito lo fermo; se è già partito, scrivi tu ${to}.`
        );
        return lines.join("\n");
    };
    let messages = info.lastMessages;
    let text = compose(messages);
    while (text.length > MAX_MESSAGE_LENGTH && messages.length) {
        messages = messages.slice(1);
        text = compose(messages);
    }
    const rows: InlineButton[][] = [
        [{ text: "Non andava bene, torna in prova", callback_data: encodeDraftDecision(info.draftId, "wrong") }]
    ];
    if (whatsappUrl) rows.push([{ text: "Apri la chat su WhatsApp", url: whatsappUrl }]);
    if (appUrl) rows.push([{ text: "Apri la scheda", url: `${appUrl}/admin/lead/${info.venueId}` }]);
    return { text, reply_markup: { inline_keyboard: rows } };
}

/** Un tipo è uscito dalla prova. */
export function buildTrustReadyText(kind: "reply" | "follow_up", inRow: number, autonomyOn: boolean): string {
    const what = kind === "reply" ? "Le risposte" : "I solleciti";
    return autonomyOn
        ? `✅ ${what} escono dalla prova (${inRow} approvazioni di fila): da ora partono senza approvazione, ogni messaggio con «Non andava bene, torna in prova».`
        : `✅ ${what} possono uscire dalla prova (${inRow} approvazioni di fila). L'autonomia è spenta: si accende da /admin/agenti.`;
}
