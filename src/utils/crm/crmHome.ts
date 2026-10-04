/**
 * La Home del CRM in dati (grafica decisa il 2026-10-05): cosa fare adesso,
 * con il più urgente in cima e il colore dell'attesa; i numeri in riga; chi è
 * caldo; l'agenda di oggi. Puro: legge ciò che la pagina ha già caricato.
 */
import type { CrmAgentDraftRow, CrmAppointmentWithVenue, CrmVenueListItem } from "@/types/crm";
import { formatWait, waitLevel, workingMinutesBetween, type CrmWaitLevel } from "@shared/crmGuide";
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
