/**
 * La Home del CRM in dati (grafica decisa il 2026-10-05): cosa fare adesso,
 * con il più urgente in cima e il colore dell'attesa; i numeri in riga; chi è
 * caldo; l'agenda di oggi. Puro: legge ciò che la pagina ha già caricato.
 */
import type { CrmAgentDraftRow, CrmAppointmentWithVenue, CrmMessage, CrmVenueListItem } from "@/types/crm";
import { formatWait, waitLevel, workingMinutesBetween, type CrmWaitLevel } from "@shared/crmGuide";
import { romeParts, romeWallClock } from "@shared/crmCallSlots";
import { isRomeToday } from "@/utils/crm/agentsOverview";

export type HomeTodoKind = "draft" | "unassigned" | "outcome";

export interface HomeTodo {
    key: string;
    kind: HomeTodoKind;
    venueId: string;
    venueName: string;
    /** La frase della riga, senza il nome del locale. */
    text: string;
    level: CrmWaitLevel;
    /** Già nel formato unico; null quando il tempo non conta. */
    wait: string | null;
    minutes: number;
    /** Il testo della bozza, quando la riga è una bozza. */
    draftText: string | null;
}

const LEVEL_ORDER: Record<CrmWaitLevel, number> = { rosso: 0, arancio: 1, normale: 2 };

const DRAFT_TEXT: Partial<Record<CrmAgentDraftRow["kind"], string>> = {
    reply: "ha scritto: la risposta è pronta",
    follow_up: "sollecito pronto",
    reactivation: "riattivazione pronta"
};

export function homeTodos(input: {
    drafts: CrmAgentDraftRow[];
    venues: CrmVenueListItem[];
    callsWithoutOutcome: CrmAppointmentWithVenue[];
    now: Date;
}): HomeTodo[] {
    const { drafts, venues, callsWithoutOutcome, now } = input;
    const todos: HomeTodo[] = [];

    for (const d of drafts) {
        if (d.status !== "pending") continue;
        const minutes = workingMinutesBetween(new Date(d.created_at), now);
        todos.push({
            key: `draft-${d.id}`,
            kind: "draft",
            venueId: d.venue_id,
            venueName: d.venue_name,
            text: DRAFT_TEXT[d.kind] ?? "una bozza aspetta voi",
            level: waitLevel(minutes),
            wait: formatWait(minutes),
            minutes,
            draftText: d.proposed_text
        });
    }

    for (const v of venues) {
        if (v.stage !== "nuovo" || v.assigned_to !== null) continue;
        const minutes = workingMinutesBetween(new Date(v.created_at), now);
        todos.push({
            key: `unassigned-${v.id}`,
            kind: "unassigned",
            venueId: v.id,
            venueName: v.name,
            text: "è nuovo e nessuno lo segue",
            level: waitLevel(minutes),
            wait: formatWait(minutes),
            minutes,
            draftText: null
        });
    }

    for (const c of callsWithoutOutcome) {
        todos.push({
            key: `outcome-${c.id}`,
            kind: "outcome",
            venueId: c.venue_id,
            venueName: c.venue_name,
            text: "com'è andata la telefonata?",
            level: "normale",
            wait: null,
            minutes: 0,
            draftText: null
        });
    }

    return todos.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.minutes - a.minutes);
}

export interface HomeFigures {
    newWeek: number;
    talking: number;
    trial: number;
    paying: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function homeFigures(venues: CrmVenueListItem[], now: Date): HomeFigures {
    const since = now.getTime() - WEEK_MS;
    return {
        newWeek: venues.filter(v => new Date(v.created_at).getTime() >= since).length,
        talking: venues.filter(v => v.stage === "in_conversazione").length,
        trial: venues.filter(v => v.stage === "in_prova").length,
        paying: venues.filter(v => v.stage === "cliente_pagante").length
    };
}

const HOT_STAGES: CrmVenueListItem["stage"][] = ["in_conversazione", "telefonata_fissata", "telefonata_fatta", "demo_fissata", "demo_fatta"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Chi si è mosso nelle ultime 24 ore, nelle fasi in cui si parla: il più recente in cima. */
export function homeHot(venues: CrmVenueListItem[], now: Date): CrmVenueListItem[] {
    const since = now.getTime() - DAY_MS;
    return venues
        .filter(v => HOT_STAGES.includes(v.stage) && new Date(v.last_activity_at).getTime() >= since)
        .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at));
}

/** Gli appuntamenti di oggi (giorno di Roma), in ordine d'orario, senza gli annullati. */
export function homeAgendaToday(appointments: CrmAppointmentWithVenue[], now: Date): CrmAppointmentWithVenue[] {
    return appointments
        .filter(a => a.status !== "cancelled" && isRomeToday(a.starts_at, now))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** «Buongiorno» fino alle 13, «Buon pomeriggio» fino alle 18, poi «Buonasera» (ora di Roma). */
export function greeting(now: Date): string {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hourCycle: "h23" }).format(now));
    if (hour < 13) return "Buongiorno";
    if (hour < 18) return "Buon pomeriggio";
    return "Buonasera";
}

export interface VenueWait {
    level: CrmWaitLevel;
    /** Già nel formato unico («40 min»). */
    wait: string;
    /** Cosa aspetta, per il nome accessibile e il sottotitolo. */
    text: string;
}

/**
 * L'attesa di ogni locale per la lista Lead e la pipeline: la cosa più urgente
 * che aspetta voi (bozza o lead nuovo senza nessuno), come nella Home.
 * I locali che non aspettano nulla non ci sono.
 */
export function venueWaits(input: { drafts: CrmAgentDraftRow[]; venues: CrmVenueListItem[]; now: Date }): Map<string, VenueWait> {
    const waits = new Map<string, VenueWait>();
    for (const todo of homeTodos({ ...input, callsWithoutOutcome: [] })) {
        if (todo.wait === null || waits.has(todo.venueId)) continue;
        waits.set(todo.venueId, { level: todo.level, wait: todo.wait, text: todo.text });
    }
    return waits;
}

export interface NavSignal {
    count: number;
    /** Il colore della cosa più urgente; null quando nessuna è oltre la mezz'ora. */
    ring: "warning" | "danger" | null;
}

function signalOf(todos: HomeTodo[]): NavSignal {
    const top = todos[0]?.level ?? "normale";
    return { count: todos.length, ring: top === "rosso" ? "danger" : top === "arancio" ? "warning" : null };
}

/**
 * I contatori della barra (U7): Home = le cose che aspettano voi (bozze e
 * nuovi senza nessuno), Lead = i nuovi senza nessuno. Il numero resta indaco,
 * l'anello prende il colore della più urgente.
 */
export function navSignals(input: { drafts: CrmAgentDraftRow[]; venues: CrmVenueListItem[]; now: Date }): {
    home: NavSignal;
    lead: NavSignal;
} {
    const todos = homeTodos({ ...input, callsWithoutOutcome: [] });
    return { home: signalOf(todos), lead: signalOf(todos.filter(t => t.kind === "unassigned")) };
}

// ── Home V3 (canvas, versione finale del 2026-10-05) ───────────────────────

const MIN_MS = 60 * 1000;

/** Lunedì alle 00:00 di Roma della settimana di `now`. */
export function romeWeekStart(now: Date): string {
    const p = romeParts(now);
    const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - (p.weekday - 1)));
    return romeWallClock(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), 0, 0).toISOString();
}

/** Il lunedì di Roma della settimana di `now`, come data (AAAA-MM-GG). */
export function romeWeekStartDate(now: Date): string {
    const p = romeParts(now);
    const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - (p.weekday - 1)));
    return monday.toISOString().slice(0, 10);
}

const ROME_DAY = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long" });

/** «Lunedì 5 ottobre». */
export function romeDayLabel(now: Date): string {
    const text = ROME_DAY.format(now);
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Da quanto, a orologio pieno (non in orario di lavoro): «20 min», «5 ore», «ieri», «3 giorni». */
export function relativeAgo(iso: string, now: Date): string {
    const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / MIN_MS));
    if (minutes < 60) return minutes <= 1 ? "adesso" : `${minutes} min`;
    if (isRomeToday(iso, now)) {
        const hours = Math.round(minutes / 60);
        return hours === 1 ? "1 ora" : `${hours} ore`;
    }
    const today = romeParts(now);
    const then = romeParts(new Date(iso));
    const days = Math.round(
        (Date.UTC(today.year, today.month - 1, today.day) - Date.UTC(then.year, then.month - 1, then.day)) / (24 * 60 * MIN_MS)
    );
    return days <= 1 ? "ieri" : `${days} giorni`;
}

/** Quanti locali aspettano chi guarda: le cose da fare sui suoi lead e sui lead di nessuno. */
export function waitingForMe(todos: HomeTodo[], venues: CrmVenueListItem[], userId: string | null): number {
    const owner = new Map(venues.map(v => [v.id, v.assigned_to]));
    const ids = new Set<string>();
    for (const t of todos) {
        if (t.kind === "outcome") continue;
        const assigned = owner.get(t.venueId);
        if (assigned === null || assigned === undefined || assigned === userId) ids.add(t.venueId);
    }
    return ids.size;
}

export interface SinceMorning {
    newLeads: number;
    /** Locali che ci hanno scritto. */
    replied: number;
    /** Telefonate fissate, col nome di chi le ha fissate (null = l'agenda o un agente). */
    calls: (string | null)[];
    /** Messaggi partiti verso i lead. */
    sent: number;
}

/** «Da stamattina alle 9:40»: cosa è successo dalla prima apertura di oggi. */
export function sinceMorning(input: {
    since: string;
    venues: CrmVenueListItem[];
    messages: CrmMessage[];
    calls: CrmAppointmentWithVenue[];
    nameOf: (userId: string | null) => string | null;
}): SinceMorning {
    const { since, venues, messages, calls, nameOf } = input;
    const after = (iso: string | null) => iso !== null && iso >= since;
    return {
        newLeads: venues.filter(v => after(v.created_at)).length,
        replied: new Set(messages.filter(m => m.direction === "in" && after(m.created_at)).map(m => m.venue_id)).size,
        calls: calls.filter(c => after(c.created_at) && c.status !== "cancelled").map(c => nameOf(c.created_by)),
        sent: messages.filter(m => m.direction === "out" && m.status === "sent" && after(m.sent_at ?? m.created_at)).length
    };
}

export interface HomeFiguresV3 extends HomeFigures {
    /** Nuovi di questa settimana meno quelli della settimana prima. */
    newWeekDelta: number;
    /** Da quanti giorni è in prova il più vecchio; null senza nessuno in prova. */
    trialSinceDays: number | null;
}

export function homeFiguresV3(venues: CrmVenueListItem[], now: Date): HomeFiguresV3 {
    const base = homeFigures(venues, now);
    const from = now.getTime() - 2 * WEEK_MS;
    const to = now.getTime() - WEEK_MS;
    const previous = venues.filter(v => {
        const t = new Date(v.created_at).getTime();
        return t >= from && t < to;
    }).length;
    const trialStarts = venues.filter(v => v.stage === "in_prova").map(v => new Date(v.stage_changed_at).getTime());
    const oldest = trialStarts.length ? Math.min(...trialStarts) : null;
    return {
        ...base,
        newWeekDelta: base.newWeek - previous,
        trialSinceDays: oldest === null ? null : Math.max(0, Math.floor((now.getTime() - oldest) / DAY_MS))
    };
}

export interface HotRow {
    venueId: string;
    name: string;
    /** L'ultima cosa che ci ha scritto; null se non la conosciamo. */
    quote: string | null;
    at: string;
}

/**
 * Caldi adesso: chi ci ha scritto nelle ultime 24 ore, il più recente in cima,
 * con la sua ultima frase. Senza messaggi (tabella non ancora sul database)
 * resta la vecchia regola: chi si è mosso nelle fasi in cui si parla.
 */
export function homeHotRows(venues: CrmVenueListItem[], messages: CrmMessage[] | null, now: Date): HotRow[] {
    if (messages === null) {
        return homeHot(venues, now).map(v => ({ venueId: v.id, name: v.name, quote: null, at: v.last_activity_at }));
    }
    const since = now.getTime() - DAY_MS;
    const names = new Map(venues.map(v => [v.id, v.name]));
    const rows = new Map<string, HotRow>();
    for (const m of messages) {
        if (m.direction !== "in" || new Date(m.created_at).getTime() < since) continue;
        const known = rows.get(m.venue_id);
        if (known && known.at >= m.created_at) continue;
        rows.set(m.venue_id, {
            venueId: m.venue_id,
            name: names.get(m.venue_id) ?? "Locale",
            quote: m.body?.trim() || null,
            at: m.created_at
        });
    }
    return [...rows.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** Telefonate fissate da lunedì (le annullate non contano). */
export function weekCallsSet(calls: CrmAppointmentWithVenue[], weekStart: string): number {
    return calls.filter(c => c.created_at >= weekStart && c.status !== "cancelled").length;
}

/**
 * Tetto dei primi messaggi WhatsApp al giorno.
 * ⚠️ SYNC: `crm_wa_claim_next` (migration 20261002220100, `v_first_today >= 30`).
 */
export const WA_FIRST_MESSAGES_PER_DAY = 30;

export interface AgentsTile {
    state: "attivi" | "in prova" | "in pausa";
    sentToday: number;
    firstToday: number;
    waiting: number;
}

export function agentsTile(input: {
    brakeOn: boolean;
    autonomyOn: boolean;
    messages: CrmMessage[];
    drafts: CrmAgentDraftRow[];
    now: Date;
}): AgentsTile {
    const { brakeOn, autonomyOn, messages, drafts, now } = input;
    const sent = messages.filter(m => m.direction === "out" && m.status === "sent" && isRomeToday(m.sent_at ?? m.created_at, now));
    return {
        state: brakeOn ? "in pausa" : autonomyOn ? "attivi" : "in prova",
        sentToday: sent.length,
        firstToday: sent.filter(m => m.purpose === "first_message").length,
        waiting: drafts.filter(d => d.status === "pending").length
    };
}

export type TimelineTone = "normale" | "attesa" | "telefonata" | "programma";

export interface TimelineEvent {
    key: string;
    at: string;
    /** Ora di Roma, 0-23: la riga dell'ora in cui cade. */
    hour: number;
    /** Prima del nome del locale. */
    before: string;
    venueId: string;
    venueName: string;
    /** Dopo il nome del locale. */
    after: string;
    tone: TimelineTone;
}

const PURPOSE_SENT: Record<NonNullable<CrmMessage["purpose"]>, string> = {
    first_message: "Primo messaggio partito a",
    reply: "Risposta partita a",
    follow_up: "Sollecito partito a",
    call_confirm: "Conferma della telefonata a",
    call_reminder: "Promemoria a",
    call_soon: "Promemoria a"
};

const PURPOSE_QUEUED: Record<NonNullable<CrmMessage["purpose"]>, string> = {
    first_message: "Primo messaggio per",
    reply: "Risposta per",
    follow_up: "Sollecito per",
    call_confirm: "Conferma della telefonata a",
    call_reminder: "Promemoria a",
    call_soon: "Promemoria a"
};

/**
 * L'Agenda ingrandita (R3b): la giornata ora per ora. Messaggi partiti e
 * arrivati, lead nuovi, bozze che aspettano, telefonate (col chiamante) e
 * messaggi in programma. Solo gli eventi del giorno [dayStart, dayEnd).
 */
export function dayTimeline(input: {
    dayStart: string;
    dayEnd: string;
    venues: CrmVenueListItem[];
    messages: CrmMessage[];
    drafts: CrmAgentDraftRow[];
    appointments: CrmAppointmentWithVenue[];
    nameOf: (userId: string | null) => string | null;
}): TimelineEvent[] {
    const { dayStart, dayEnd, venues, messages, drafts, appointments, nameOf } = input;
    const inDay = (iso: string | null): iso is string => iso !== null && iso >= dayStart && iso < dayEnd;
    const names = new Map(venues.map(v => [v.id, v.name]));
    const nameOfVenue = (id: string) => names.get(id) ?? "Locale";
    const events: TimelineEvent[] = [];
    const push = (e: Omit<TimelineEvent, "hour">) => events.push({ ...e, hour: romeParts(new Date(e.at)).hour });

    for (const v of venues) {
        if (inDay(v.created_at)) {
            const source = v.crm_leads[0]?.source === "meta_form" ? "dal modulo Meta" : "";
            push({ key: `v-${v.id}`, at: v.created_at, before: `Lead nuovo ${source}`.trim() + ":", venueId: v.id, venueName: v.name, after: "", tone: "normale" });
        }
    }
    for (const m of messages) {
        if (m.direction === "in") {
            if (inDay(m.created_at)) {
                push({ key: `m-${m.id}`, at: m.created_at, before: "", venueId: m.venue_id, venueName: nameOfVenue(m.venue_id), after: "ha scritto", tone: "normale" });
            }
            continue;
        }
        const at = m.status === "sent" ? (m.sent_at ?? m.created_at) : m.status === "queued" ? m.created_at : null;
        if (!inDay(at)) continue;
        const queued = m.status === "queued";
        push({
            key: `m-${m.id}`,
            at,
            before: m.purpose
                ? (queued ? PURPOSE_QUEUED : PURPOSE_SENT)[m.purpose]
                : queued
                  ? "Messaggio per"
                  : "Messaggio partito a",
            venueId: m.venue_id,
            venueName: nameOfVenue(m.venue_id),
            after: queued ? "(in programma)" : "",
            tone: queued ? "programma" : "normale"
        });
    }
    for (const d of drafts) {
        if (d.status === "pending" && inDay(d.created_at)) {
            push({ key: `d-${d.id}`, at: d.created_at, before: "", venueId: d.venue_id, venueName: d.venue_name, after: DRAFT_TEXT[d.kind] ?? "bozza in attesa", tone: "attesa" });
        }
    }
    for (const a of appointments) {
        if (a.status === "cancelled" || !inDay(a.starts_at)) continue;
        const caller = nameOf(a.caller_user_id);
        push({ key: `a-${a.id}`, at: a.starts_at, before: "Telefonata con", venueId: a.venue_id, venueName: a.venue_name, after: caller ? `· chiama ${caller}` : "", tone: "telefonata" });
    }
    return events.sort((a, b) => a.at.localeCompare(b.at));
}

/** Le ore da mostrare: dalle 9 alle 18, allargate agli eventi fuori orario. */
export function timelineHours(events: TimelineEvent[]): number[] {
    const hours = events.map(e => e.hour);
    const from = Math.min(9, ...hours);
    const to = Math.max(18, ...hours);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
