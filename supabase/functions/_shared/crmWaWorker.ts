// =============================================================================
// CRM interno (F1-2): connettore WhatsApp Web, parte pura (zero import)
// =============================================================================
//
// Lo usano l'edge `crm-wa-worker` (validazione di ciò che manda il Mac, testi
// Telegram) e il comando `scripts/crm-wa/crm-wa.mjs` sul Mac (data-id e ora
// dei messaggi letti da WhatsApp Web). Niente rete, niente Deno: lo provano i
// test vitest qui accanto.
//
// WhatsApp Web, per ogni messaggio di una chat privata:
//   * data-id = «<true|false>_<numero>@c.us_<id>»: true = scritto da noi;
//   * data-pre-plain-text = «[10:32, 5/10/2026] Anna: » (formato italiano:
//     ora, poi giorno/mese/anno, ora di Roma).
// I gruppi (@g.us) e gli id anonimi (@lid) non sono lead: si scartano.
// =============================================================================

export const WA_KINDS = ["text", "voice", "image", "video", "document", "sticker", "other"] as const;
export type WaKind = (typeof WA_KINDS)[number];

export interface WaSnapshotMessage {
    id: string;
    from_me: boolean;
    kind: WaKind;
    text: string | null;
    at: string | null;
}

export interface WaSnapshotChat {
    phone: string;
    messages: WaSnapshotMessage[];
}

export const WA_MAX_CHATS = 20;
export const WA_MAX_MESSAGES = 200;
const MAX_ID = 200;
const MAX_TEXT = 4000;
const E164 = /^\+[1-9][0-9]{6,14}$/;

/** Telefono E.164 da un data-id di una chat privata; null per gruppi e id anonimi. */
export function phoneFromWaId(waId: string): string | null {
    const match = /^(?:true|false)_(\d{7,15})@c\.us(?:_|$)/.exec(waId.trim());
    return match ? `+${match[1]}` : null;
}

/** Il messaggio l'abbiamo scritto noi (numero dell'agente)? null se il data-id non è riconoscibile. */
export function isFromMe(waId: string): boolean | null {
    if (waId.startsWith("true_")) return true;
    if (waId.startsWith("false_")) return false;
    return null;
}

/** Scarto tra l'ora di Roma e UTC, in minuti, in un istante. */
function romeOffsetMinutes(at: Date): number {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Rome",
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** Ora di Roma (data e ora «da orologio») → istante ISO. */
export function romeWallClockToIso(year: number, month: number, day: number, hour: number, minute: number): string {
    const wall = Date.UTC(year, month - 1, day, hour, minute);
    let guess = wall - romeOffsetMinutes(new Date(wall)) * 60_000;
    guess = wall - romeOffsetMinutes(new Date(guess)) * 60_000;
    return new Date(guess).toISOString();
}

/** «[10:32, 5/10/2026] Anna: » → istante ISO; null se il formato non torna. */
export function parsePrePlainText(value: string | null | undefined): string | null {
    const match = /^\[(\d{1,2}):(\d{2}),\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\]/.exec((value ?? "").trim());
    if (!match) return null;
    const [hour, minute, day, month, year] = match.slice(1).map(Number);
    if (hour > 23 || minute > 59 || day < 1 || day > 31 || month < 1 || month > 12) return null;
    return romeWallClockToIso(year, month, day, hour, minute);
}

function cleanText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, MAX_TEXT) : null;
}

function cleanAt(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Istantanea di una chat mandata dal Mac. Il telefono, se manca, si ricava dal
 * primo data-id; `from_me`, se manca, dal data-id. Messaggi senza id scartati.
 */
export function parseSnapshotChat(input: unknown): ParseResult<WaSnapshotChat> {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "invalid_chat" };
    const raw = input as Record<string, unknown>;
    if (!Array.isArray(raw.messages)) return { ok: false, error: "invalid_messages" };
    if (raw.messages.length > WA_MAX_MESSAGES) return { ok: false, error: "too_many_messages" };

    const messages: WaSnapshotMessage[] = [];
    for (const item of raw.messages) {
        if (!item || typeof item !== "object") continue;
        const m = item as Record<string, unknown>;
        const id = typeof m.id === "string" ? m.id.trim().slice(0, MAX_ID) : "";
        if (!id) continue;
        const fromMe = typeof m.from_me === "boolean" ? m.from_me : isFromMe(id);
        if (fromMe === null) continue;
        const kind = WA_KINDS.includes(m.kind as WaKind) ? (m.kind as WaKind) : m.kind == null ? "text" : "other";
        messages.push({ id, from_me: fromMe, kind, text: cleanText(m.text), at: cleanAt(m.at) });
    }

    let phone = typeof raw.phone === "string" ? raw.phone.trim() : "";
    if (!phone) phone = messages.map(m => phoneFromWaId(m.id)).find(Boolean) ?? "";
    if (!E164.test(phone)) return { ok: false, error: "invalid_phone" };
    return { ok: true, value: { phone, messages } };
}

// Risposta unica di «chats»: uguale per un lead, un numero sconosciuto o un
// errore di salvataggio, così il segreto del Mac non dice chi è nel CRM.
export const WA_CHATS_REPLY: Readonly<{ ok: true }> = Object.freeze({ ok: true });

export function parseSnapshotBatch(input: unknown): ParseResult<WaSnapshotChat[]> {
    const chats = (input as { chats?: unknown } | null)?.chats;
    if (!Array.isArray(chats)) return { ok: false, error: "invalid_chats" };
    if (chats.length > WA_MAX_CHATS) return { ok: false, error: "too_many_chats" };
    const out: WaSnapshotChat[] = [];
    for (const chat of chats) {
        const parsed = parseSnapshotChat(chat);
        if (!parsed.ok) return parsed;
        out.push(parsed.value);
    }
    return { ok: true, value: out };
}

// -----------------------------------------------------------------------------
// Testi Telegram
// -----------------------------------------------------------------------------
function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const KIND_NOTE: Record<WaKind, string | null> = {
    text: null,
    voice: "un vocale, da ascoltare su WhatsApp",
    image: "una foto, da guardare su WhatsApp",
    video: "un video, da guardare su WhatsApp",
    document: "un documento, da aprire su WhatsApp",
    sticker: "uno sticker",
    other: "un messaggio che il CRM non sa leggere, da guardare su WhatsApp"
};

export interface InboundMessageLite {
    kind: WaKind;
    body: string | null;
}

const QUOTE_MAX = 600;

/** Un messaggio Telegram per locale con tutti i messaggi nuovi del lead. */
export function buildInboundAlert(data: {
    contactName: string | null;
    venueName: string;
    messages: InboundMessageLite[];
    adminUrl: string | null;
}): string {
    const who = escapeHtml(data.contactName?.trim() || "Il lead");
    const lines = [`💬 <b>${who}</b> (${escapeHtml(data.venueName)}) ha scritto su WhatsApp:`];
    for (const m of data.messages) {
        const note = KIND_NOTE[m.kind];
        const text = m.body ? escapeHtml(m.body.length > QUOTE_MAX ? `${m.body.slice(0, QUOTE_MAX)}…` : m.body) : null;
        if (note && text) lines.push(`• ${note}: «${text}»`);
        else if (note) lines.push(`• ${note}`);
        else lines.push(`• «${text ?? ""}»`);
    }
    if (data.adminUrl) lines.push("", `<a href="${escapeHtml(data.adminUrl)}">Apri nel CRM</a>`);
    return lines.join("\n");
}

export type WaChannelAlert = "failures" | "needs_relink" | "warning" | "silent";

/** Avviso al team quando il canale mette in pausa gli agenti. */
export function buildChannelAlert(code: WaChannelAlert, detail?: string | null): string {
    const head = "<b>Agenti in pausa: problema sul canale WhatsApp</b>";
    const body: Record<WaChannelAlert, string> = {
        failures: "Tre invii di fila non sono andati. Guarda le chat su WhatsApp Web prima di ripartire.",
        needs_relink: "WhatsApp Web chiede di ricollegare il telefono: inquadra il QR sul Mac.",
        warning: `WhatsApp Web mostra un avviso${detail ? `: «${escapeHtml(detail)}»` : "."}`,
        silent: "Il Mac di WhatsApp non dà segni di vita da 15 minuti: controlla che sia acceso e connesso."
    };
    return `${head}\n${body[code]}\nPer riattivarli: /admin, Agenti.`;
}

// -----------------------------------------------------------------------------
// Chi può chiamare cosa (review di Lorenzo del 2026-10-02)
// -----------------------------------------------------------------------------
// Il segreto del Mac apre solo le sue quattro azioni; il controllo del Mac
// muto (watchdog) apre solo col segreto dei job di pg_cron. Un segreto del Mac
// rubato non tocca altro: niente letture del CRM, niente impostazioni, niente
// pausa tolta, niente testo scelto da lui.
export const WA_WORKER_ACTIONS = ["heartbeat", "chats", "next", "result"] as const;
export type WaWorkerAction = (typeof WA_WORKER_ACTIONS)[number];

export function authorizeWorkerCall(
    action: unknown,
    headers: { worker: string | null; job: string | null },
    matches: (given: string | null, which: "worker" | "job") => boolean
): WaWorkerAction | "watchdog" | null {
    if (action === "watchdog") return matches(headers.job, "job") ? "watchdog" : null;
    if (typeof action !== "string" || !(WA_WORKER_ACTIONS as readonly string[]).includes(action)) return null;
    return matches(headers.worker, "worker") ? (action as WaWorkerAction) : null;
}

// -----------------------------------------------------------------------------
// Il testo lo decide il server, il Mac lo copia
// -----------------------------------------------------------------------------
// `next` restituisce al Mac solo id, numero e testo finale: niente modello,
// niente segnaposto, niente nome da completare. Il testo viene da
// crm_messages.body (scritto lato server) o dal primo messaggio approvato,
// riempito nell'edge. Un segnaposto rimasto ({nome}…) o un testo vuoto non
// partono: il Mac non ha niente da comporre. I messaggi dei lead entrano solo
// come dati (chats → crm_messages) e non diventano mai testo in uscita da qui.
export interface WaSendInstruction {
    message_id: string;
    phone: string;
    body: string;
}

const LEFTOVER_PLACEHOLDER = /\{[a-z_]+\}/i;
export const WA_MAX_BODY = 4000;

export function buildSendInstruction(input: {
    messageId: string | null | undefined;
    phone: string | null | undefined;
    body: string | null | undefined;
}): ParseResult<WaSendInstruction> {
    const body = typeof input.body === "string" ? input.body.trim() : "";
    if (!input.messageId) return { ok: false, error: "Messaggio senza id." };
    if (!input.phone || !E164.test(input.phone)) return { ok: false, error: "Numero non valido." };
    if (!body) return { ok: false, error: "Testo del messaggio mancante." };
    if (body.length > WA_MAX_BODY) return { ok: false, error: "Testo del messaggio troppo lungo." };
    if (LEFTOVER_PLACEHOLDER.test(body)) return { ok: false, error: "Testo con un segnaposto non riempito." };
    return { ok: true, value: { message_id: input.messageId, phone: input.phone, body } };
}

/** Il numero dell'agente ha scritto in una chat che il CRM non conosce. */
/**
 * Messaggi partiti dal numero dell'agente verso lead del CRM che non sono testi
 * della coda: li ha scritti una persona dal telefono, o il Mac di testa sua
 * (review di Lorenzo, 2026-10-04). Il team lo sa in ogni caso.
 */
export function buildHandWrittenAlert(venueNames: string[]): string {
    const names = [...new Set(venueNames.map(n => n.trim()).filter(Boolean))];
    const where = names.length === 0 ? "a un lead" : names.length === 1 ? `a ${escapeHtml(names[0])}` : `a ${names.length} lead (${names.map(escapeHtml).join(", ")})`;
    return (
        "<b>Scritto a mano dal numero dell'agente</b>\n" +
        `Un messaggio ${where} non viene dalla coda del CRM. ` +
        "Se l'ha scritto qualcuno del team va bene così: la coda di quel locale è stata annullata. Se non è stato nessuno, controlla WhatsApp Web e metti in pausa gli agenti da /admin, Agenti."
    );
}

export function buildUnknownChatAlert(count: number): string {
    return (
        "<b>Il numero dell'agente ha scritto fuori dal CRM</b>\n" +
        `${count === 1 ? "Una chat" : `${count} chat`} con messaggi nostri verso numeri che non sono lead. ` +
        "Il Mac deve mandare solo i testi della coda: controlla WhatsApp Web e, se non sei stato tu, metti in pausa gli agenti da /admin, Agenti."
    );
}
