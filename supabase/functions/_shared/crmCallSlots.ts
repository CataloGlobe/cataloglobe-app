// Agenda del CRM (F1-4a): le regole degli orari della telefonata, pure.
//
// UN SOLO FILE, non una coppia ⚠️ SYNC: l'Edge lo importa come
// `./crmCallSlots.ts`, il frontend come `@shared/crmCallSlots` (alias su
// supabase/functions/_shared). Per restare importabile da entrambi il file non
// importa niente: niente API Deno, niente import con suffisso .ts.
//
// Tutto si ragiona nell'ora di Roma, cambio dell'ora compreso: le fasce sono
// orari da parete («17:30»), gli istanti sono Date (UTC vero).
//
// ⚠️ SYNC con SQL: `callReminderAt` (il giorno prima alle 18) è anche in
// `crm_call_reminder_at` (migration 20261003230100), che decide quando si
// accoda il promemoria; questa copia serve solo a dirlo nella scheda.

/** Una fascia in cui si chiama: giorni ISO (1 = lunedì … 7 = domenica). */
export interface CallWindow {
    days: number[];
    start: string;
    end: string;
}

/** Un impegno che occupa il calendario (Google o un'altra telefonata del CRM). */
export interface BusyInterval {
    start: Date;
    end: Date;
    label: string;
}

/** Fasce decise nella call del 2026-10-03: 9-11 e 17:30-18:30, lunedì-venerdì. */
export const DEFAULT_CALL_WINDOWS: CallWindow[] = [
    { days: [1, 2, 3, 4, 5], start: "09:00", end: "11:00" },
    { days: [1, 2, 3, 4, 5], start: "17:30", end: "18:30" }
];
export const DEFAULT_CALL_DURATION_MINUTES = 10;
export const DEFAULT_CALL_MIN_NOTICE_MINUTES = 60;
/** Il brief a chi chiama parte un'ora prima (call del 2026-10-03). */
export const BRIEF_MINUTES_BEFORE = 60;
/** Il promemoria al lead parte il giorno prima a quest'ora di Roma. */
export const REMINDER_HOUR = 18;
/** «Com'è andata?» parte qualche minuto dopo la fine prevista. */
export const OUTCOME_MINUTES_AFTER = 5;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_WINDOWS = 12;

export const CALL_DAY_LABELS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"] as const;

function minutesOf(time: string): number {
    const m = TIME_RE.exec(time);
    if (!m) return NaN;
    return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Legge le fasce salvate (jsonb). Null se la forma non torna: giorni 1-7 senza
 * doppioni, orari «HH:MM», inizio prima della fine, al massimo 12 fasce.
 * ⚠️ SYNC con `crm_call_windows_ok` (migration 20261003230000).
 */
export function parseCallWindows(value: unknown): CallWindow[] | null {
    if (!Array.isArray(value) || value.length > MAX_WINDOWS) return null;
    const out: CallWindow[] = [];
    for (const item of value) {
        if (!item || typeof item !== "object") return null;
        const { days, start, end } = item as Record<string, unknown>;
        if (!Array.isArray(days) || days.length === 0 || days.length > 7) return null;
        if (!days.every(d => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7)) return null;
        if (new Set(days).size !== days.length) return null;
        if (typeof start !== "string" || typeof end !== "string") return null;
        const s = minutesOf(start);
        const e = minutesOf(end);
        if (Number.isNaN(s) || Number.isNaN(e) || s >= e) return null;
        out.push({ days: [...(days as number[])].sort((a, b) => a - b), start, end });
    }
    return out;
}

// -----------------------------------------------------------------------------
// Ora di Roma
// -----------------------------------------------------------------------------
export interface RomeParts {
    year: number;
    /** 1-12. */
    month: number;
    day: number;
    hour: number;
    minute: number;
    /** 1 = lunedì … 7 = domenica. */
    weekday: number;
}

const ROME_PARTS = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short"
});
const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function romeParts(at: Date): RomeParts {
    const p: Record<string, string> = {};
    for (const part of ROME_PARTS.formatToParts(at)) p[part.type] = part.value;
    return {
        year: Number(p.year),
        month: Number(p.month),
        day: Number(p.day),
        hour: Number(p.hour),
        minute: Number(p.minute),
        weekday: WEEKDAYS[p.weekday] ?? 0
    };
}

/**
 * L'istante in cui a Roma l'orologio segna quel giorno e quell'ora. Un'ora che
 * non esiste (la notte del passaggio all'ora legale) scivola avanti di un'ora.
 */
export function romeWallClock(year: number, month: number, day: number, hour: number, minute: number): Date {
    const wanted = Date.UTC(year, month - 1, day, hour, minute);
    const shows = (t: number) => {
        const p = romeParts(new Date(t));
        return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) === wanted;
    };
    // Roma è a +2 (legale) o +1 (solare). L'ora doppia di ottobre prende la
    // prima volta (+2); l'ora che manca a marzo scivola avanti (+1 la mostra
    // un'ora dopo).
    const summer = wanted - 2 * 60 * 60 * 1000;
    if (shows(summer)) return new Date(summer);
    return new Date(wanted - 60 * 60 * 1000);
}

/** «AAAA-MM-GG» del giorno di Roma. */
export function romeDayKey(at: Date): string {
    const p = romeParts(at);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Il giorno di calendario dopo (o prima) di `days`, senza passare dagli istanti. */
function shiftDay(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
    const d = new Date(Date.UTC(year, month - 1, day + days));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function isoWeekday(year: number, month: number, day: number): number {
    const w = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return w === 0 ? 7 : w;
}

// -----------------------------------------------------------------------------
// Fasce, sovrapposizioni, orari liberi
// -----------------------------------------------------------------------------
/** True se la telefonata sta tutta dentro una fascia del suo giorno di Roma. */
export function isInsideCallWindows(start: Date, durationMinutes: number, windows: CallWindow[]): boolean {
    const p = romeParts(start);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    if (romeDayKey(end) !== romeDayKey(start)) return false;
    const e = romeParts(end);
    const from = p.hour * 60 + p.minute;
    const to = e.hour * 60 + e.minute;
    return windows.some(w => w.days.includes(p.weekday) && from >= minutesOf(w.start) && to <= minutesOf(w.end));
}

/** Gli impegni che si accavallano con [start, end). Toccarsi non conta. */
export function overlapsOf(start: Date, end: Date, busy: BusyInterval[]): BusyInterval[] {
    return busy.filter(b => b.start.getTime() < end.getTime() && b.end.getTime() > start.getTime());
}

export interface SuggestCallSlotsInput {
    now: Date;
    windows: CallWindow[];
    durationMinutes: number;
    minNoticeMinutes: number;
    busy: BusyInterval[];
    /** Quanti giorni di calendario guardare, oggi compreso. */
    days?: number;
    stepMinutes?: number;
    limit?: number;
}

/**
 * I primi orari liberi dentro le fasce: almeno `minNoticeMinutes` da adesso,
 * senza accavallarsi con nessun impegno, a passi di 15 minuti. In ordine.
 */
export function suggestCallSlots(input: SuggestCallSlotsInput): Date[] {
    const { now, windows, durationMinutes, minNoticeMinutes, busy } = input;
    const days = input.days ?? 7;
    const step = input.stepMinutes ?? 15;
    const limit = input.limit ?? 6;
    const earliest = now.getTime() + minNoticeMinutes * 60_000;
    const today = romeParts(now);
    const out: Date[] = [];
    for (let offset = 0; offset < days && out.length < limit; offset++) {
        const d = shiftDay(today.year, today.month, today.day, offset);
        const weekday = isoWeekday(d.year, d.month, d.day);
        const starts: number[] = [];
        for (const w of windows) {
            if (!w.days.includes(weekday)) continue;
            for (let m = minutesOf(w.start); m + durationMinutes <= minutesOf(w.end); m += step) starts.push(m);
        }
        for (const m of [...new Set(starts)].sort((a, b) => a - b)) {
            const start = romeWallClock(d.year, d.month, d.day, Math.floor(m / 60), m % 60);
            if (start.getTime() < earliest) continue;
            // L'ora che non esiste (cambio dell'ora) scivola: si scarta.
            const shown = romeParts(start);
            if (shown.hour * 60 + shown.minute !== m) continue;
            const end = new Date(start.getTime() + durationMinutes * 60_000);
            if (overlapsOf(start, end, busy).length > 0) continue;
            out.push(start);
            if (out.length >= limit) break;
        }
    }
    return out;
}

// -----------------------------------------------------------------------------
// Promemoria e brief
// -----------------------------------------------------------------------------
/** Il giorno prima della telefonata alle 18 di Roma. ⚠️ SYNC con `crm_call_reminder_at`. */
export function callReminderAt(startsAt: Date): Date {
    const p = romeParts(startsAt);
    const prev = shiftDay(p.year, p.month, p.day, -1);
    return romeWallClock(prev.year, prev.month, prev.day, REMINDER_HOUR, 0);
}

/**
 * Quando partirà il promemoria, o null se non partirà: telefonata fissata dopo
 * le 18 del giorno prima o per il giorno stesso (basta la conferma).
 */
export function plannedReminderAt(startsAt: Date, createdAt: Date): Date | null {
    const at = callReminderAt(startsAt);
    return createdAt.getTime() < at.getTime() ? at : null;
}

export function briefAt(startsAt: Date): Date {
    return new Date(startsAt.getTime() - BRIEF_MINUTES_BEFORE * 60_000);
}

// -----------------------------------------------------------------------------
// Testi
// -----------------------------------------------------------------------------
const DAY_NAME = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long" });

/** «giovedì 9». */
export function formatCallDay(at: Date): string {
    return `${DAY_NAME.format(at)} ${romeParts(at).day}`;
}

/** «17:45». */
export function formatCallTime(at: Date): string {
    const p = romeParts(at);
    return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/**
 * Riempie {giorno} e {ora} di un testo della telefonata. {nome}, {locale} e
 * {mittente} li riempie poi `fillWhatsappTemplate`, come nel primo messaggio.
 */
export function fillCallPlaceholders(template: string, startsAt: Date): string {
    const day = formatCallDay(startsAt);
    const time = formatCallTime(startsAt);
    return template.replace(/\{giorno\}/g, () => day).replace(/\{ora\}/g, () => time);
}
