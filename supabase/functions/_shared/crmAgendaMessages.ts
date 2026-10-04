// Agenda del CRM (F1-4a): i messaggi Telegram per chi chiama, puri.
//
//   * «Puoi tu?»: la telefonata l'ha fissata un altro e chiama te → «Sì, chiamo
//     io» / «Propongo un altro orario» / «Chiedo a {nome} se può lui»; stesso
//     messaggio dopo 30 minuti senza risposta, poi passa a chi l'ha fissata
//     (handoverAt)
//   * «Chiedo a {nome}»: a chi l'ha fissata arriva «Puoi tu?» → «Sì, chiamo io»
//     / «No, proponi un altro orario»; la conferma al lead parte solo dopo il sì
//   * brief un'ora prima: chi è, che locale, cosa ha chiesto, ultimi messaggi
//   * «Com'è andata?» dopo la fine → Fatta / Non ha risposto / Da fissare di nuovo
//   * avviso a chi l'ha fissata quando chi doveva chiamare dice no
//
// Lo usano crm-notify (job «agenda») e crm-telegram-webhook.

import {
    CALL_SHIFT_MINUTES,
    escapeHtml,
    uuidToShort,
    type CallShiftMinutes,
    type InlineButton,
    type TelegramMessage
} from "./crmTelegram.ts";
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
    /** Chi l'ha fissata è un'altra persona del team: si può chiedere a lei. */
    canHandOver: boolean;
    /** Chi doveva chiamare ha già chiesto a chi l'ha fissata (creator_asked_at). */
    creatorAsked?: boolean;
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

// ⚠️ SYNC con crm_agenda_has_work (migration 20261004010600).
export const CALLER_REMINDER_MINUTES = 30;
const HANDOVER_HOURS_BEFORE = 2;
const HANDOVER_LAST_MINUTES = 10;

/**
 * Quando la telefonata senza risposta passa a chi l'ha fissata: 2 ore prima,
 * ma mai prima del sollecito (30 minuti dal «Puoi tu?») e mai a meno di 10
 * minuti dall'orario.
 */
export function handoverAt(startsAt: string, callerAskedAt: string): Date {
    const starts = new Date(startsAt).getTime();
    const twoHours = starts - HANDOVER_HOURS_BEFORE * 3_600_000;
    const afterReminder = new Date(callerAskedAt).getTime() + CALLER_REMINDER_MINUTES * 60_000;
    return new Date(Math.min(Math.max(twoHours, afterReminder), starts - HANDOVER_LAST_MINUTES * 60_000));
}

export function encodeCallHandover(appointmentId: string): string {
    return `ch:${uuidToShort(appointmentId)}`;
}

export function encodeCallAskCreator(appointmentId: string): string {
    return `ck:${uuidToShort(appointmentId)}`;
}

export function encodeCallOtherMenu(appointmentId: string, open: boolean): string {
    return `${open ? "cx" : "cb"}:${uuidToShort(appointmentId)}`;
}

export function encodeCallOtherTime(appointmentId: string, shiftMinutes: CallShiftMinutes): string {
    return `ct:${uuidToShort(appointmentId)}:${shiftMinutes}`;
}

function callerRequestLines(info: AgendaCallInfo, reminder: boolean): string[] {
    const by = info.createdByName ? `${escapeHtml(info.createdByName)} ha fissato` : "C'è";
    const lines = reminder ? ["⏰ <b>Ancora senza risposta.</b>"] : [];
    lines.push(
        `${by} una telefonata con ${venueLine(info)}${info.contactName ? ` (${escapeHtml(info.contactName)})` : ""}.`,
        `<b>Puoi tu ${when(info)}?</b> Dura ${minutes(info)} minuti.`
    );
    if (info.note) lines.push(`Nota: ${escapeHtml(info.note)}`);
    lines.push("Finché non rispondi, al lead non parte la conferma.");
    if (info.canHandOver && info.createdByName) {
        lines.push(`Se non rispondi, prima dell'orario la telefonata passa a ${escapeHtml(info.createdByName)}.`);
    }
    return lines;
}

/**
 * «Puoi tu giovedì 9 alle 17:45?» a chi deve chiamare. Con `reminder` è il
 * sollecito, uguale ma con «Ancora senza risposta» in testa.
 */
export function buildCallerRequestMessage(
    info: AgendaCallInfo,
    appUrl: string | null,
    reminder = false
): TelegramMessage {
    const open = openButton(appUrl, info.venueId);
    const rows: InlineButton[][] = [
        [{ text: "Sì, chiamo io", callback_data: encodeCallAnswer(info.appointmentId, true) }],
        [{ text: "Propongo un altro orario", callback_data: encodeCallOtherMenu(info.appointmentId, true) }]
    ];
    if (info.canHandOver) {
        const to = info.createdByName ? `Chiedo a ${info.createdByName} se può lui` : "Chiedo a chi l'ha fissata";
        rows.push([{ text: to, callback_data: encodeCallAskCreator(info.appointmentId) }]);
    }
    if (open.length) rows.push(open);
    return { text: callerRequestLines(info, reminder).join("\n"), reply_markup: { inline_keyboard: rows } };
}

/**
 * «Chiedo a {nome} se può lui»: la domanda a chi l'ha fissata. Il sì gliela
 * passa (crm_handover_call), il no apre gli altri orari come per chi chiamava.
 */
export function buildCreatorQuestionMessage(info: AgendaCallInfo, appUrl: string | null): TelegramMessage {
    const caller = escapeHtml(info.callerName ?? "Chi doveva chiamare");
    const lines = [
        `${caller} non può fare la telefonata con ${venueLine(info)}${info.contactName ? ` (${escapeHtml(info.contactName)})` : ""}.`,
        `<b>Puoi tu ${when(info)}?</b> Dura ${minutes(info)} minuti.`
    ];
    if (info.note) lines.push(`Nota: ${escapeHtml(info.note)}`);
    lines.push(
        "Finché non rispondi, al lead non parte la conferma.",
        "Se non rispondi, prima dell'orario la telefonata resta a te e al lead parte la conferma."
    );
    const open = openButton(appUrl, info.venueId);
    const rows: InlineButton[][] = [
        [{ text: "Sì, chiamo io", callback_data: encodeCallHandover(info.appointmentId) }],
        [{ text: "No, proponi un altro orario", callback_data: encodeCallOtherMenu(info.appointmentId, true) }]
    ];
    if (open.length) rows.push(open);
    return { text: lines.join("\n"), reply_markup: { inline_keyboard: rows } };
}

function shifted(info: AgendaCallInfo, shiftMinutes: CallShiftMinutes): Date {
    return new Date(new Date(info.startsAt).getTime() + shiftMinutes * 60_000);
}

/** «Propongo un altro orario»: gli orari tra cui scegliere, al posto dei tasti di prima. */
export function buildCallerOtherTimeMessage(info: AgendaCallInfo): TelegramMessage {
    const rows: InlineButton[][] = CALL_SHIFT_MINUTES.map(m => [
        {
            text: m === 1440 ? `Domani, ${formatCallDay(shifted(info, m))}, alle ${formatCallTime(shifted(info, m))}` : `Alle ${formatCallTime(shifted(info, m))}`,
            callback_data: encodeCallOtherTime(info.appointmentId, m)
        }
    ]);
    rows.push([{ text: "Indietro", callback_data: encodeCallOtherMenu(info.appointmentId, false) }]);
    const to = info.contactName ? `a ${escapeHtml(info.contactName)}` : "al lead";
    const lines = [
        `Telefonata con ${venueLine(info)} di ${when(info)}.`,
        `<b>Che orario proponi ${to}?</b>`,
        "Questa telefonata si annulla. Preparo il messaggio per lui: arriva qui come bozza e parte solo quando lo approvi.",
        "Per un altro giorno, fissala dalla scheda."
    ];
    return { text: lines.join("\n"), reply_markup: { inline_keyboard: rows } };
}

function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Il messaggio al lead, sempre al singolare (parla una persona):
 * «Giovedì 8 alle 17:45 non riesco, possiamo fare alle 18:00?».
 */
export function buildLeadOtherTimeText(info: Pick<AgendaCallInfo, "startsAt">, shiftMinutes: CallShiftMinutes): string {
    const at = new Date(info.startsAt);
    const next = new Date(at.getTime() + shiftMinutes * 60_000);
    const sameDay = formatCallDay(next) === formatCallDay(at);
    const sameTime = formatCallTime(next) === formatCallTime(at);
    // «alla stessa ora» solo se lo è davvero (non a cavallo di mezzanotte né
    // nel giorno del cambio d'ora).
    const proposal = sameDay
        ? `alle ${formatCallTime(next)}`
        : `${formatCallDay(next)} ${sameTime ? "alla stessa ora" : `alle ${formatCallTime(next)}`}`;
    return `${capitalize(formatCallDay(at))} alle ${formatCallTime(at)} non riesco, possiamo fare ${proposal}?`;
}

/**
 * A chi l'ha fissata, quando la telefonata passa a lei dal sistema (nessuna
 * risposta a 2 ore dall'orario). `creatorAsked`: chi chiamava aveva già
 * chiesto a lei, ed è lei che non ha risposto.
 */
export function buildHandedOverText(info: AgendaCallInfo, creatorAsked = false): string {
    const caller = escapeHtml(info.callerName ?? "Chi doveva chiamare");
    const first = creatorAsked
        ? `📞 Non hai risposto: la telefonata con ${escapeHtml(info.venueName)} di ${when(info)} resta a te.`
        : `📞 ${caller} non ha risposto al «Puoi tu?»: la telefonata con ${escapeHtml(info.venueName)} di ${when(info)} la fai tu.`;
    return `${first}\nÈ confermata e al lead parte la conferma. Se non puoi, spostala o annullala dalla scheda.`;
}

/**
 * A chi doveva chiamare, quando la telefonata passa a chi l'ha fissata.
 * `creatorAsked`: dopo la sua domanda (sì di chi l'ha fissata, o nessuna
 * risposta); altrimenti è lui che non aveva risposto.
 */
export function buildHandedOverCallerText(info: AgendaCallInfo, creatorAsked = false): string {
    const to = escapeHtml(info.createdByName ?? "chi l'ha fissata");
    return creatorAsked
        ? `📞 La telefonata con ${escapeHtml(info.venueName)} di ${when(info)} la fa ${to}. Al lead parte la conferma.`
        : `La telefonata con ${escapeHtml(info.venueName)} di ${when(info)} l'ha presa ${to}: non avevi risposto.`;
}

/**
 * All'altra persona: chi ha in mano la domanda propone un altro orario al
 * lead. `byName` = chi propone (chi chiamava, o chi l'ha fissata dopo la
 * domanda).
 */
export function buildOtherTimeProposedText(info: AgendaCallInfo, leadText: string, byName?: string | null): string {
    const by = escapeHtml(byName ?? info.callerName ?? "Chi doveva chiamare");
    return (
        `${by} non può fare la telefonata con ${escapeHtml(info.venueName)} di ${when(info)} e propone un altro orario. ` +
        `La telefonata è annullata; al lead andrà: «${escapeHtml(leadText)}». La bozza arriva qui, da approvare.`
    );
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
                    { text: "Fatta, ci ho parlato", callback_data: encodeCallOutcome(info.appointmentId, "done") },
                    { text: "Non ha risposto", callback_data: encodeCallOutcome(info.appointmentId, "no_show") }
                ],
                [{ text: "Da fissare di nuovo", callback_data: encodeCallOutcome(info.appointmentId, "postponed") }, ...open]
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
    done: "fatta, ci ha parlato",
    no_show: "non ha risposto",
    postponed: "da fissare di nuovo"
};
