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
//   * chi ha il lead assegnato vede «Gira a <nome dell'altro>»;
//     con più di due persone «Gira a…» apre la scelta tra i nomi;
//   * chi non ce l'ha vede «Lo prendo io».
// Dopo ogni passaggio il webhook riscrive il messaggio di tutti: «Preso da
// <nome>» e pulsanti invertiti.
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

export function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
//   g:<venue>         apri la scelta «Gira a…»
//   x:<venue>         chiudi la scelta (torna ai pulsanti normali)
export type CrmCallback =
    | { action: "assign"; venueId: string; userId: string }
    | { action: "choose"; venueId: string }
    | { action: "cancel"; venueId: string };

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
            text: `Gira a ${others[0].display_name}`,
            callback_data: encodeAssign(venueId, others[0].user_id)
        }];
    }
    return [{ text: "Gira a…", callback_data: `g:${uuidToShort(venueId)}` }];
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
function headline(data: CrmLeadMessageData): string {
    if (data.kind === "escalation") {
        const hours = data.waitingHours ?? 2;
        return `⏰ <b>Lead fermo in Nuovo da ${hours} ${hours === 1 ? "ora" : "ore"}</b>`;
    }
    if (data.kind === "returned") return "↩️ <b>È tornato un lead già nel CRM</b>";
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

    lines.push(
        `<b>${escapeHtml(data.venueName)}</b>${data.city ? ` · ${escapeHtml(data.city)}` : ""}`
    );
    const person = [data.contactName, data.phoneE164].filter(Boolean).map(v => escapeHtml(String(v)));
    if (person.length) lines.push(person.join(" · "));

    const origin = [data.sourceLabel, data.adName, data.campaign]
        .filter(Boolean)
        .map(v => escapeHtml(String(v)));
    lines.push(`Da: ${origin.join(" · ")}`);
    if (data.interests.length) lines.push(`Interessi: ${escapeHtml(data.interests.join(", "))}`);

    const answers = Object.entries(data.formAnswers ?? {}).filter(
        ([, value]) => value !== null && value !== undefined && String(value).trim() !== ""
    );
    if (answers.length) {
        lines.push("");
        for (const [key, value] of answers.slice(0, MAX_ANSWERS)) {
            const text = String(value);
            const short = text.length > MAX_ANSWER_LENGTH ? `${text.slice(0, MAX_ANSWER_LENGTH)}…` : text;
            lines.push(`<i>${escapeHtml(key.replace(/_/g, " "))}</i>: ${escapeHtml(short)}`);
        }
        if (answers.length > MAX_ANSWERS) lines.push(`… e altre ${answers.length - MAX_ANSWERS} risposte`);
    }

    lines.push("", `${escapeHtml(data.stageLabel)} · ${assignmentLine(data.assignedTo, recipientId, team)}`);

    const keyboard: InlineButton[][] = [];
    const links: InlineButton[] = [];
    if (whatsappUrl && data.hasPhone && !data.stoppedBefore) {
        links.push({ text: "Scrivi su WhatsApp", url: whatsappUrl });
    }
    if (data.adminUrl) links.push({ text: "Apri nel CRM", url: data.adminUrl });
    if (links.length) keyboard.push(links);
    const assign = assignmentButtons(data.venueId, data.assignedTo, recipientId, team);
    if (assign.length) keyboard.push(assign);

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
