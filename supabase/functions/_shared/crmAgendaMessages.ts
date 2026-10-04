// Agenda del CRM (F1-4a): i messaggi Telegram per chi chiama, puri.
//
//   * «Puoi tu?»: la telefonata l'ha fissata un altro e chiama te → Sì / No
//   * brief un'ora prima: chi è, che locale, cosa ha chiesto, ultimi messaggi
//   * «Com'è andata?» dopo la fine → Fatta / Non ha risposto / Rimandata
//   * avviso a chi l'ha fissata quando chi doveva chiamare dice no
//
// Lo usano crm-notify (job «agenda») e crm-telegram-webhook.

import { escapeHtml, uuidToShort, type InlineButton, type TelegramMessage } from "./crmTelegram.ts";
import { formatCallDay, formatCallTime } from "./crmCallSlots.ts";

export interface AgendaCallInfo {
    appointmentId: string;
    venueId: string;
    venueName: string;
    city: string | null;
    contactName: string | null;
    phone: string | null;
    startsAt: string;
    endsAt: string;
    callerName: string | null;
    createdByName: string | null;
    note: string | null;
}

export interface AgendaBriefExtras {
    stageLabel: string | null;
    interests: string[];
    answers: { label: string; value: string }[];
    lastMessages: { author: "lead" | "agent" | "person"; text: string }[];
}

const MAX_MESSAGE = 220;
const MAX_ANSWERS = 6;

function when(info: Pick<AgendaCallInfo, "startsAt">): string {
    const at = new Date(info.startsAt);
    return `${formatCallDay(at)} alle ${formatCallTime(at)}`;
}

function minutes(info: Pick<AgendaCallInfo, "startsAt" | "endsAt">): number {
    return Math.round((new Date(info.endsAt).getTime() - new Date(info.startsAt).getTime()) / 60_000);
}

function venueLine(info: AgendaCallInfo): string {
    const city = info.city ? `, ${escapeHtml(info.city)}` : "";
    return `<b>${escapeHtml(info.venueName)}</b>${city}`;
}

function leadUrl(appUrl: string | null, venueId: string): string | null {
    return appUrl ? `${appUrl}/admin/lead/${venueId}` : null;
}

function openButton(appUrl: string | null, venueId: string): InlineButton[] {
    const url = leadUrl(appUrl, venueId);
    return url ? [{ text: "Apri la scheda", url }] : [];
}

export function encodeCallAnswer(appointmentId: string, accept: boolean): string {
    return `${accept ? "cy" : "cn"}:${uuidToShort(appointmentId)}`;
}

export function encodeCallOutcome(appointmentId: string, outcome: "done" | "no_show" | "postponed"): string {
    const prefix = outcome === "done" ? "od" : outcome === "no_show" ? "on" : "op";
    return `${prefix}:${uuidToShort(appointmentId)}`;
}

/** «Puoi tu giovedì 9 alle 17:45?» a chi deve chiamare. */
export function buildCallerRequestMessage(info: AgendaCallInfo, appUrl: string | null): TelegramMessage {
    const by = info.createdByName ? `${escapeHtml(info.createdByName)} ha fissato` : "C'è";
    const lines = [
        `${by} una telefonata con ${venueLine(info)}${info.contactName ? ` (${escapeHtml(info.contactName)})` : ""}.`,
        `<b>Puoi tu ${when(info)}?</b> Dura ${minutes(info)} minuti.`
    ];
    if (info.note) lines.push(`Nota: ${escapeHtml(info.note)}`);
    lines.push("Finché non dici sì, al lead non parte la conferma.");
    const open = openButton(appUrl, info.venueId);
    return {
        text: lines.join("\n"),
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "Sì, chiamo io", callback_data: encodeCallAnswer(info.appointmentId, true) },
                    { text: "No, non posso", callback_data: encodeCallAnswer(info.appointmentId, false) }
                ],
                ...(open.length ? [open] : [])
            ]
        }
    };
}

/** Brief un'ora prima, senza AI (il riassunto con Gea arriva in F1-8). */
export function buildBriefMessage(info: AgendaCallInfo, extras: AgendaBriefExtras, appUrl: string | null): TelegramMessage {
    const lines = [
        `<b>Tra poco: telefonata ${when(info)}</b> (${minutes(info)} minuti)`,
        venueLine(info),
        info.contactName ? `Chi: ${escapeHtml(info.contactName)}` : null,
        info.phone ? `Telefono: ${escapeHtml(info.phone)}` : null,
        extras.stageLabel ? `Fase: ${escapeHtml(extras.stageLabel)}` : null,
        extras.interests.length ? `Interessi: ${escapeHtml(extras.interests.join(", "))}` : null,
        info.note ? `Nota: ${escapeHtml(info.note)}` : null
    ].filter((l): l is string => Boolean(l));

    const answers = extras.answers.slice(0, MAX_ANSWERS);
    if (answers.length) {
        lines.push("", "<b>Dal modulo</b>");
        for (const a of answers) lines.push(`${escapeHtml(a.label)}: ${escapeHtml(a.value.slice(0, MAX_MESSAGE))}`);
    }
    if (extras.lastMessages.length) {
        lines.push("", "<b>Ultimi messaggi</b>");
        for (const m of extras.lastMessages) {
            const who = m.author === "lead" ? "Lead" : m.author === "person" ? "A mano" : "Agente";
            const text = m.text.length > MAX_MESSAGE ? `${m.text.slice(0, MAX_MESSAGE - 1)}…` : m.text;
            lines.push(`${who}: ${escapeHtml(text)}`);
        }
    }
    const open = openButton(appUrl, info.venueId);
    return { text: lines.join("\n"), reply_markup: { inline_keyboard: open.length ? [open] : [] } };
}

/** «Com'è andata?» dopo la telefonata. */
export function buildOutcomeMessage(info: AgendaCallInfo, appUrl: string | null): TelegramMessage {
    const open = openButton(appUrl, info.venueId);
    return {
        text: `Com'è andata la telefonata con ${venueLine(info)} di ${when(info)}?`,
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "Fatta", callback_data: encodeCallOutcome(info.appointmentId, "done") },
                    { text: "Non ha risposto", callback_data: encodeCallOutcome(info.appointmentId, "no_show") }
                ],
                [{ text: "Rimandata", callback_data: encodeCallOutcome(info.appointmentId, "postponed") }, ...open]
            ]
        }
    };
}

/** A chi l'ha fissata: chi doveva chiamare non può. */
export function buildCallerDeclinedText(info: AgendaCallInfo): string {
    // Va a sendToTeam, che manda in HTML: il nome del locale va protetto.
    const who = escapeHtml(info.callerName ?? "Chi doveva chiamare");
    return `${who} non può fare la telefonata con ${escapeHtml(info.venueName)} di ${when(info)}. Annullata: fissane un'altra dalla scheda.`;
}

/** Testo che sostituisce il messaggio dopo il tocco, senza più pulsanti di scelta. */
export function buildAnsweredText(info: AgendaCallInfo, answer: string): string {
    return `Telefonata con ${venueLine(info)} di ${when(info)}: ${escapeHtml(answer)}`;
}

export const CALL_OUTCOME_LABEL: Record<"done" | "no_show" | "postponed", string> = {
    done: "fatta",
    no_show: "non ha risposto",
    postponed: "rimandata, da fissare di nuovo"
};
