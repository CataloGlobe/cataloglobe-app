// =============================================================================
// CRM interno: messaggi Telegram dei lead (puro, zero import)
// =============================================================================
//
// Costruisce testo e pulsanti dei messaggi del bot. Niente rete, niente Deno:
// lo usano le edge `crm-notify` e `crm-telegram-webhook` e lo provano i test
// vitest qui accanto.
//
// Pulsanti per destinatario (decisione di Alex, 2026-10-01): il bot è uno ma
// ogni messaggio va nella chat privata di ciascuno.
//   * chi ha il lead assegnato vede «Assegnalo a <nome dell'altro>»;
//     con più di due persone «Assegnalo a un'altra persona…» apre i nomi;
//   * chi non ce l'ha vede «Lo prendo io».
// Dopo ogni passaggio il webhook riscrive il messaggio di tutti: «Preso da
// <nome>» e pulsanti invertiti.
//
// Un tasto per riga, col testo che dice cosa succede (Alex, 2026-10-02 sera):
// affiancati si troncano e non si capisce cosa fanno.
//
// callback_data ha un limite di 64 byte: gli uuid viaggiano in base64url
// (22 caratteri), «a:<venue>:<user>» = 47 byte.
// =============================================================================

export interface CrmTeamMemberLite {
    user_id: string;
    display_name: string;
}

export type CrmNotificationKind = "new_lead" | "returned" | "escalation";

export interface CrmLeadMessageData {
    kind: CrmNotificationKind;
    venueId: string;
    venueName: string;
    city: string | null;
    stageLabel: string;
    contactName: string | null;
    phoneE164: string | null;
    sourceLabel: string;
    adName: string | null;
    campaign: string | null;
    interests: string[];
    formAnswers: Record<string, unknown>;
    /** Lead fermato con uno stop definitivo e tornato: va segnalato. */
    stoppedBefore: boolean;
    assignedTo: string | null;
    /** Ore di attesa nella fascia 9-21 (solo escalation). */
    waitingHours?: number;
    /** Link alla scheda in /admin, se APP_URL è configurato. */
    adminUrl: string | null;
    /** Il contatto ha un telefono: il pulsante WhatsApp ha senso. */
    hasPhone: boolean;
    /** Solo `returned`: contesto, consiglio e confronto del nome del locale. */
    returned?: CrmReturnedContext;
}

export type CrmVenueNameMatch = "same" | "typo" | "other";
export type CrmVenueNameCheck = "same" | "later";

/**
 * Campi tecnici della landing (copiati da `crm_sync_landing_leads`): servono
 * all'attribuzione, non a chi chiama. Fuori dal messaggio Telegram e dalla
 * scheda in /admin (decisione di Alex del 2026-10-02).
 */
export const CRM_TECHNICAL_ANSWER_KEYS: ReadonlySet<string> = new Set([
    "variant",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "referrer",
    "landing_path"
]);

/**
 * Lead tornato con lo stesso telefono (decisione di Alex del 2026-10-02, wiki
 * ingresso-lead-e-assegnazione): chi è, da quando lo conosciamo, a che punto
 * è, cosa conviene fare; se ha scritto un altro nome del locale, l'etichetta
 * «Locale da verificare» c'è già e i tasti scelgono il nome: quello che
 * avevamo o quello nuovo.
 */
export interface CrmReturnedContext {
    leadId: string;
    /** Primo ingresso del locale (crm_venues.created_at). */
    knownSince: string;
    /** Fase attuale (chiave). */
    stageKey: string;
    /** Giorni interi nella fase attuale. */
    daysInStage: number;
    /** Fase e tipo di Perso al momento del ritorno (evento lead_returned). */
    previousStage: string | null;
    previousLostKind: string | null;
    venueNameGiven: string | null;
    venueNameMatch: CrmVenueNameMatch | null;
    venueNameCheck: CrmVenueNameCheck | null;
}

export interface InlineButton {
    text: string;
    callback_data?: string;
    url?: string;
}

export interface TelegramMessage {
    text: string;
    reply_markup: { inline_keyboard: InlineButton[][] };
}

const MAX_ANSWERS = 8;
const MAX_ANSWER_LENGTH = 200;
const MAX_BUTTON_NAME = 28;

function buttonName(name: string): string {
    const text = name.trim();
    return text.length > MAX_BUTTON_NAME ? `${text.slice(0, MAX_BUTTON_NAME - 1)}…` : text;
}

export function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// -----------------------------------------------------------------------------
// uuid <-> base64url (callback_data corto)
// -----------------------------------------------------------------------------
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function uuidToShort(uuid: string): string {
    const hex = uuid.replace(/-/g, "");
    if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error("invalid uuid");
    let bits = "";
    for (const ch of hex) bits += parseInt(ch, 16).toString(2).padStart(4, "0");
    bits += "0000"; // 128 bit → 132, multiplo di 6
    let out = "";
    for (let i = 0; i < bits.length; i += 6) out += B64[parseInt(bits.slice(i, i + 6), 2)];
    return out;
}

export function shortToUuid(short: string): string | null {
    if (!/^[A-Za-z0-9_-]{22}$/.test(short)) return null;
    let bits = "";
    for (const ch of short) bits += B64.indexOf(ch).toString(2).padStart(6, "0");
    bits = bits.slice(0, 128);
    let hex = "";
    for (let i = 0; i < 128; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// -----------------------------------------------------------------------------
// callback_data
// -----------------------------------------------------------------------------
//   a:<venue>:<user>  assegna il locale a <user>
//   g:<venue>         apri la scelta tra i nomi
//   x:<venue>         chiudi la scelta (torna ai pulsanti normali)
//   cy|cn:<call>      chi deve chiamare dice sì / no (agenda; «cn» solo nei messaggi vecchi)
//   ch:<call>         passa a chi l'ha fissata («Sì, chiamo io» di chi l'ha fissata)
//   ck:<call>         «Chiedo a {nome} se può lui»: la domanda a chi l'ha fissata
//   cx|cb:<call>      apre / chiude la scelta di un altro orario
//   ct:<call>:<min>   propone al lead lo stesso giorno <min> minuti dopo (1440 = domani)
//   od|on|op:<call>   esito: fatta / non ha risposto / da fissare di nuovo (agenda)
//   ds|de|dx|dv|dp|dh|dk|dj:<bozza>  tocco su una bozza dell'agente (F1-3)
export type CrmCallback =
    | { action: "assign"; venueId: string; userId: string }
    | { action: "choose"; venueId: string }
    | { action: "cancel"; venueId: string }
    | { action: "venue_same"; leadId: string }
    | { action: "venue_later"; leadId: string }
    | { action: "venue_rename"; leadId: string }
    // Agenda (F1-4a): «Puoi tu?» a chi deve chiamare, «Com'è andata?» dopo.
    | { action: "call_answer"; appointmentId: string; accept: boolean }
    | { action: "call_handover"; appointmentId: string }
    | { action: "call_ask_creator"; appointmentId: string }
    | { action: "call_other_menu"; appointmentId: string; open: boolean }
    | { action: "call_other_time"; appointmentId: string; shiftMinutes: CallShiftMinutes }
    | { action: "call_outcome"; appointmentId: string; outcome: "done" | "no_show" | "postponed" }
    // Agente in prova (F1-3): il tocco su una bozza.
    | { action: "draft"; draftId: string; decision: CrmDraftDecision }
    // Gea 1 (F1-8): «Sì, fallo» / «No» su un comando del gruppo 2.
    | { action: "gea_confirm"; inboxId: string; accept: boolean };

/** Spostamenti offerti da «Propongo un altro orario»: 1440 = domani alla stessa ora. */
export const CALL_SHIFT_MINUTES = [15, 30, 60, 1440] as const;
export type CallShiftMinutes = (typeof CALL_SHIFT_MINUTES)[number];

export type CrmDraftDecision = "send" | "edit" | "discard" | "schedule" | "other" | "handle" | "stop" | "objection" | "lost" | "wrong";

export const DRAFT_DECISION_PREFIX: Record<CrmDraftDecision, string> = {
    send: "ds",
    edit: "de",
    discard: "dx",
    schedule: "dv",
    other: "dp",
    handle: "dh",
    stop: "dk",
    objection: "dj",
    lost: "dl",
    wrong: "dw"
};

export function encodeDraftDecision(draftId: string, decision: CrmDraftDecision): string {
    return `${DRAFT_DECISION_PREFIX[decision]}:${uuidToShort(draftId)}`;
}

export function encodeGeaConfirm(inboxId: string, accept: boolean): string {
    return `${accept ? "gy" : "gn"}:${uuidToShort(inboxId)}`;
}

export function encodeAssign(venueId: string, userId: string): string {
    return `a:${uuidToShort(venueId)}:${uuidToShort(userId)}`;
}

export function parseCallbackData(data: string): CrmCallback | null {
    const parts = data.split(":");
    const venueId = parts[1] ? shortToUuid(parts[1]) : null;
    if (!venueId) return null;
    if (parts[0] === "a" && parts.length === 3) {
        const userId = shortToUuid(parts[2]);
        return userId ? { action: "assign", venueId, userId } : null;
    }
    if (parts[0] === "g" && parts.length === 2) return { action: "choose", venueId };
    if (parts[0] === "x" && parts.length === 2) return { action: "cancel", venueId };
    // «s»/«n»/«l» portano l'id del lead, non del locale. «l» («Decido dopo»)
    // non si offre più: resta per i messaggi vecchi.
    if (parts[0] === "s" && parts.length === 2) return { action: "venue_same", leadId: venueId };
    if (parts[0] === "n" && parts.length === 2) return { action: "venue_rename", leadId: venueId };
    if (parts[0] === "l" && parts.length === 2) return { action: "venue_later", leadId: venueId };
    if (parts[0] === "ct" && parts.length === 3) {
        const shift = Number(parts[2]);
        const known = CALL_SHIFT_MINUTES.find(m => m === shift);
        return known ? { action: "call_other_time", appointmentId: venueId, shiftMinutes: known } : null;
    }
    // Agenda: l'id è della telefonata.
    if (parts.length === 2) {
        const appointmentId = venueId;
        if (parts[0] === "cy") return { action: "call_answer", appointmentId, accept: true };
        if (parts[0] === "cn") return { action: "call_answer", appointmentId, accept: false };
        if (parts[0] === "ch") return { action: "call_handover", appointmentId };
        if (parts[0] === "ck") return { action: "call_ask_creator", appointmentId };
        if (parts[0] === "cx") return { action: "call_other_menu", appointmentId, open: true };
        if (parts[0] === "cb") return { action: "call_other_menu", appointmentId, open: false };
        if (parts[0] === "od") return { action: "call_outcome", appointmentId, outcome: "done" };
        if (parts[0] === "on") return { action: "call_outcome", appointmentId, outcome: "no_show" };
        if (parts[0] === "op") return { action: "call_outcome", appointmentId, outcome: "postponed" };
        if (parts[0] === "gy") return { action: "gea_confirm", inboxId: appointmentId, accept: true };
        if (parts[0] === "gn") return { action: "gea_confirm", inboxId: appointmentId, accept: false };
        const decision = (Object.keys(DRAFT_DECISION_PREFIX) as CrmDraftDecision[]).find(
            d => DRAFT_DECISION_PREFIX[d] === parts[0]
        );
        if (decision) return { action: "draft", draftId: appointmentId, decision };
    }
    return null;
}

// -----------------------------------------------------------------------------
// Pulsanti per destinatario
// -----------------------------------------------------------------------------
export function assignmentButtons(
    venueId: string,
    assignedTo: string | null,
    recipientId: string,
    team: CrmTeamMemberLite[]
): InlineButton[] {
    if (assignedTo !== recipientId) {
        return [{ text: "Lo prendo io", callback_data: encodeAssign(venueId, recipientId) }];
    }
    const others = team.filter(m => m.user_id !== recipientId);
    if (others.length === 0) return [];
    if (others.length === 1) {
        return [{
            text: `Assegnalo a ${others[0].display_name}`,
            callback_data: encodeAssign(venueId, others[0].user_id)
        }];
    }
    return [{ text: "Assegnalo a un'altra persona…", callback_data: `g:${uuidToShort(venueId)}` }];
}

/** La scelta tra i nomi dopo «Gira a…». */
export function chooseButtons(
    venueId: string,
    recipientId: string,
    team: CrmTeamMemberLite[]
): InlineButton[][] {
    const rows = team
        .filter(m => m.user_id !== recipientId)
        .map(m => [{ text: m.display_name, callback_data: encodeAssign(venueId, m.user_id) }]);
    rows.push([{ text: "Annulla", callback_data: `x:${uuidToShort(venueId)}` }]);
    return rows;
}

// -----------------------------------------------------------------------------
// Messaggio
// -----------------------------------------------------------------------------
const ROME_DAY_MONTH = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit"
});

function firstWord(name: string | undefined): string | null {
    const word = (name ?? "").trim().split(/\s+/)[0];
    return word ? word : null;
}

function daysText(days: number): string {
    if (days <= 0) return "da oggi";
    return days === 1 ? "da 1 giorno" : `da ${days} giorni`;
}

/** Cosa conviene fare con un lead tornato, dalla fase in cui era. */
export function returnedAdvice(ctx: CrmReturnedContext): string {
    if (ctx.previousStage === "perso" && ctx.previousLostKind === "obiezione") {
        return "Era in Perso perché «non adesso» ed è tornato in Nuovo da solo: ora è interessato, scrivigli subito.";
    }
    switch (ctx.stageKey) {
        case "nuovo":
            return "Non l'abbiamo ancora contattato: scrivigli adesso, ha appena compilato il modulo.";
        case "contattato":
            return `È in Contattato ${daysText(ctx.daysInStage)} senza risposta: è il momento buono per richiamarlo.`;
        case "in_prova":
            return "È in prova: forse gli serve una mano, sentilo.";
        case "cliente_pagante":
            return "È già cliente: forse gli serve assistenza o vuole aggiungere un locale, sentilo.";
        case "perso":
            return "Era in Perso: ha richiesto informazioni, vale la pena riprovare.";
        default:
            return "È già in trattativa: tienine conto al prossimo contatto.";
    }
}

/**
 * Tasti sul nome del locale, solo se ha scritto un nome diverso e nessuno ha
 * ancora scelto: tenere il nome che avevamo o usare quello nuovo.
 */
export function venueNameButtons(
    ctx: CrmReturnedContext | undefined,
    knownName: string
): InlineButton[] {
    if (!ctx || (ctx.venueNameMatch !== "typo" && ctx.venueNameMatch !== "other")) return [];
    if (ctx.venueNameCheck === "same" || !ctx.venueNameGiven) return [];
    const short = uuidToShort(ctx.leadId);
    return [
        { text: `È lo stesso locale: resta «${buttonName(knownName)}»`, callback_data: `s:${short}` },
        { text: `È lo stesso locale: rinominalo «${buttonName(ctx.venueNameGiven)}»`, callback_data: `n:${short}` }
    ];
}

function returnedLines(
    data: CrmLeadMessageData,
    ctx: CrmReturnedContext,
    recipientId: string,
    team: CrmTeamMemberLite[]
): string[] {
    const who = firstWord(team.find(m => m.user_id === recipientId)?.display_name);
    const person = data.contactName ? `<b>${escapeHtml(data.contactName)}</b>` : "Una persona che conosciamo";
    const phone = data.phoneE164 ? ` (${escapeHtml(data.phoneE164)})` : "";
    const since = ROME_DAY_MONTH.format(new Date(ctx.knownSince));
    const lines = [
        `${who ? `${escapeHtml(who)}, ` : ""}${person}${phone} ha compilato di nuovo il modulo. ` +
            `Lo conosciamo già come <b>${escapeHtml(data.venueName)}</b> ` +
            `(entrato il ${since}, ora in <i>${escapeHtml(data.stageLabel)}</i> ${daysText(ctx.daysInStage)}).`
    ];
    const differs = ctx.venueNameMatch === "typo" || ctx.venueNameMatch === "other";
    if (differs && ctx.venueNameGiven) {
        const guess = ctx.venueNameMatch === "typo" ? "sembra un refuso" : "sembra un altro locale";
        lines.push(`Stavolta ha scritto <b>${escapeHtml(ctx.venueNameGiven)}</b>: ${guess}.`);
        if (ctx.venueNameCheck === "same") {
            lines.push(`✅ Deciso: è lo stesso locale, si chiama ${escapeHtml(data.venueName)}.`);
        } else {
            lines.push(
                "🕓 Sulla scheda c'è l'etichetta «Locale da verificare». Se non lo sai, chiediglielo al prossimo contatto; " +
                    "è un altro locale? Per ora scrivilo in una nota."
            );
        }
    }
    lines.push(`👉 ${escapeHtml(returnedAdvice(ctx))}`);
    return lines;
}

function headline(data: CrmLeadMessageData): string {
    if (data.kind === "escalation") {
        const hours = data.waitingHours ?? 2;
        return `⏰ <b>Lead fermo in Nuovo da ${hours} ${hours === 1 ? "ora" : "ore"}</b>`;
    }
    if (data.kind === "returned") {
        return data.returned
            ? "↩️ <b>Ha compilato di nuovo il modulo</b>"
            : "↩️ <b>È tornato un lead già nel CRM</b>";
    }
    return "🆕 <b>Nuovo lead</b>";
}

function assignmentLine(
    assignedTo: string | null,
    recipientId: string,
    team: CrmTeamMemberLite[]
): string {
    if (!assignedTo) return "Non assegnato";
    if (assignedTo === recipientId) return "Assegnato a te";
    const name = team.find(m => m.user_id === assignedTo)?.display_name ?? "un altro";
    return `Preso da ${escapeHtml(name)}`;
}

/**
 * `whatsappUrl` è per destinatario (link firmato con il suo id, edge
 * `crm-wa`): lo calcola il chiamante. Null = niente pulsante WhatsApp.
 */
export function buildLeadMessage(
    data: CrmLeadMessageData,
    recipientId: string,
    team: CrmTeamMemberLite[],
    whatsappUrl: string | null = null
): TelegramMessage {
    const lines: string[] = [headline(data), ""];

    if (data.stoppedBefore) {
        lines.push("🛑 <b>Aveva chiesto di non essere contattato.</b> Non scrivergli.", "");
    }

    if (data.kind === "returned" && data.returned) {
        lines.push(...returnedLines(data, data.returned, recipientId, team), "");
    } else {
        lines.push(
            `<b>${escapeHtml(data.venueName)}</b>${data.city ? ` · ${escapeHtml(data.city)}` : ""}`
        );
        const person = [data.contactName, data.phoneE164].filter(Boolean).map(v => escapeHtml(String(v)));
        if (person.length) lines.push(person.join(" · "));
    }

    const origin = [data.sourceLabel, data.adName, data.campaign]
        .filter(Boolean)
        .map(v => escapeHtml(String(v)));
    lines.push(`Da: ${origin.join(" · ")}`);
    if (data.interests.length) lines.push(`Interessi: ${escapeHtml(data.interests.join(", "))}`);

    const answers = Object.entries(data.formAnswers ?? {}).filter(
        ([key, value]) =>
            !CRM_TECHNICAL_ANSWER_KEYS.has(key) &&
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ""
    );
    if (answers.length) {
        lines.push("");
        for (const [key, value] of answers.slice(0, MAX_ANSWERS)) {
            const text = String(value);
            const short = text.length > MAX_ANSWER_LENGTH ? `${text.slice(0, MAX_ANSWER_LENGTH)}…` : text;
            const label = key === "phone_raw" ? "telefono scritto (non valido)" : key.replace(/_/g, " ");
            lines.push(`<i>${escapeHtml(label)}</i>: ${escapeHtml(short)}`);
        }
        if (answers.length > MAX_ANSWERS) lines.push(`… e altre ${answers.length - MAX_ANSWERS} risposte`);
    }

    lines.push("", `${escapeHtml(data.stageLabel)} · ${assignmentLine(data.assignedTo, recipientId, team)}`);

    const buttons: InlineButton[] = [];
    if (whatsappUrl && data.hasPhone && !data.stoppedBefore) {
        buttons.push({ text: "Apri la chat su WhatsApp", url: whatsappUrl });
    }
    if (data.kind === "returned") buttons.push(...venueNameButtons(data.returned, data.venueName));
    buttons.push(...assignmentButtons(data.venueId, data.assignedTo, recipientId, team));
    if (data.adminUrl) buttons.push({ text: "Apri la scheda", url: data.adminUrl });

    return { text: lines.join("\n"), reply_markup: { inline_keyboard: buttons.map(b => [b]) } };
}

// -----------------------------------------------------------------------------
// Destinatari dell'outbox
// -----------------------------------------------------------------------------
// Lead nuovo → tutto il team collegato a Telegram. Lead che torna → solo chi
// lo ha in carico (decisione di Alex, 2026-10-01); se nessuno ce l'ha, tutti.
// `done` = niente da mandare e niente da riprovare: il lead torna a chi non ha
// collegato Telegram, che lo vede nella scheda in /admin.

export interface OutboxRecipient {
    user_id: string;
    telegram_chat_id: number | null;
}

export function pickOutboxRecipients<T extends OutboxRecipient>(
    kind: "new_lead" | "returned",
    assignedTo: string | null,
    team: T[]
): { recipients: T[]; done: boolean } {
    const linked = team.filter(m => m.telegram_chat_id !== null);
    if (kind === "returned" && assignedTo && team.some(m => m.user_id === assignedTo)) {
        const recipients = linked.filter(m => m.user_id === assignedTo);
        return { recipients, done: recipients.length === 0 };
    }
    return { recipients: linked, done: false };
}

// -----------------------------------------------------------------------------
// Riepilogo di un import CSV
// -----------------------------------------------------------------------------
// I lead arrivati da più di 24 ore non hanno una notifica ciascuno: un solo
// messaggio per import (decisione di Alex, 2026-10-01).

export interface CrmImportSummaryData {
    importerName: string | null;
    created: number;
    returned: number;
    duplicate: number;
    suppressed: number;
    failed: number;
    /** Link all'elenco in /admin, se APP_URL è configurato. */
    listUrl: string | null;
}

export function buildImportSummaryMessage(data: CrmImportSummaryData): TelegramMessage {
    const by = data.importerName ? ` di ${escapeHtml(data.importerName)}` : "";
    const lines = [
        `📥 <b>Import CSV Meta${by}</b>`,
        "",
        `Nuovi locali: ${data.created}`,
        `Già nel CRM (richiesta aggiunta): ${data.returned}`
    ];
    if (data.duplicate > 0) lines.push(`Già importati prima: ${data.duplicate}`);
    if (data.suppressed > 0) lines.push(`Esclusi perché hanno chiesto lo stop: ${data.suppressed}`);
    if (data.failed > 0) lines.push(`Non entrati: ${data.failed}`);
    lines.push("", "I lead arrivati da più di 24 ore non hanno una notifica ciascuno: sono nell'elenco.");

    const keyboard: InlineButton[][] = data.listUrl
        ? [[{ text: "Apri l'elenco", url: data.listUrl }]]
        : [];
    return { text: lines.join("\n"), reply_markup: { inline_keyboard: keyboard } };
}

// -----------------------------------------------------------------------------
// Sollecito: minuti nella fascia 9-21 ora di Roma
// -----------------------------------------------------------------------------
// Decisione di Alex (2026-10-01): sollecito dopo 2 ore di Nuovo, contate solo
// tra le 9 e le 21. Un lead delle 23 sollecita alle 11 del giorno dopo.
//
// ⚠️ SYNC: il cron `crm-notify` (migration 20261001130300) chiama l'edge solo
// se l'ora di Roma è tra 9 e 20 e c'è un lead in Nuovo da più di 2 ore reali.
// La soglia qui resta la fonte: quella del cron è solo un prefiltro.
export const ESCALATION_WINDOW_START_HOUR = 9;
export const ESCALATION_WINDOW_END_HOUR = 21;
export const ESCALATION_AFTER_MINUTES = 120;

const ROME_HOUR = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    hourCycle: "h23"
});

function romeHour(date: Date): number {
    return Number(ROME_HOUR.formatToParts(date).find(p => p.type === "hour")?.value ?? "0");
}

/** Minuti tra `from` e `to` che cadono nella fascia 9-21 di Roma. */
export function romeWindowMinutesBetween(from: Date, to: Date): number {
    if (to.getTime() <= from.getTime()) return 0;
    let minutes = 0;
    // Passo di un minuto, al massimo una settimana: un lead fermo più a lungo
    // è comunque oltre la soglia.
    const cap = Math.min(to.getTime(), from.getTime() + 7 * 24 * 60 * 60_000);
    for (let t = from.getTime(); t < cap; t += 60_000) {
        const hour = romeHour(new Date(t));
        if (hour >= ESCALATION_WINDOW_START_HOUR && hour < ESCALATION_WINDOW_END_HOUR) minutes += 1;
        if (minutes >= ESCALATION_AFTER_MINUTES * 4) break;
    }
    return minutes;
}

export function isEscalationDue(receivedAt: Date, now: Date): boolean {
    return romeWindowMinutesBetween(receivedAt, now) >= ESCALATION_AFTER_MINUTES;
}
