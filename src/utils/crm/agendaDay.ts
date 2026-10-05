/**
 * L'Agenda in dati (canvas T8c, versione finale del 2026-10-05): la striscia
 * della settimana, la giornata scelta in ordine d'ora (ciò che è partito, ciò
 * che parte da solo, le telefonate) con la riga di adesso, e la riga di domani.
 * Puro: legge ciò che la pagina ha già caricato.
 */
import type { CrmAppointmentWithVenue, CrmMessage, CrmQueuedMessage, CrmVenueListItem } from "@/types/crm";
import { CALL_DAY_LABELS, formatCallTime, romeDayKey, romeWallClock } from "@shared/crmCallSlots";
import { PURPOSE_QUEUED, PURPOSE_SENT } from "@/utils/crm/crmHome";

function parseKey(key: string): { year: number; month: number; day: number } {
    const [year, month, day] = key.split("-").map(Number);
    return { year, month, day };
}

/** Il giorno `days` dopo (o prima) di `key`, come «AAAA-MM-GG». */
export function shiftDayKey(key: string, days: number): string {
    const { year, month, day } = parseKey(key);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Il lunedì della settimana di `key`. */
export function weekStartKey(key: string): string {
    const { year, month, day } = parseKey(key);
    const w = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return shiftDayKey(key, -((w + 6) % 7));
}

/** Inizio e fine (esclusa) del giorno di Roma, come istanti ISO. */
export function dayBounds(key: string): { start: string; end: string } {
    const a = parseKey(key);
    const b = parseKey(shiftDayKey(key, 1));
    return {
        start: romeWallClock(a.year, a.month, a.day, 0, 0).toISOString(),
        end: romeWallClock(b.year, b.month, b.day, 0, 0).toISOString()
    };
}

export interface AgendaWeekDay {
    key: string;
    /** «lun» … «dom». */
    weekday: string;
    day: number;
    isToday: boolean;
    /** Un puntino: in quel giorno c'è almeno una telefonata. */
    hasCalls: boolean;
}

/** I sette giorni da lunedì, col puntino dove c'è una telefonata non annullata. */
export function agendaWeek(weekStart: string, todayKey: string, appointments: CrmAppointmentWithVenue[]): AgendaWeekDay[] {
    const callDays = new Set(appointments.filter(a => a.status !== "cancelled").map(a => romeDayKey(new Date(a.starts_at))));
    return CALL_DAY_LABELS.map((weekday, i) => {
        const key = shiftDayKey(weekStart, i);
        return { key, weekday, day: parseKey(key).day, isToday: key === todayKey, hasCalls: callDays.has(key) };
    });
}

const MONTH = new Intl.DateTimeFormat("it-IT", { month: "long", timeZone: "UTC" });

/** «ottobre», o «settembre-ottobre» quando la settimana sta su due mesi. */
export function weekMonthLabel(weekStart: string): string {
    const name = (key: string) => {
        const { year, month, day } = parseKey(key);
        return MONTH.format(new Date(Date.UTC(year, month - 1, day)));
    };
    const first = name(weekStart);
    const last = name(shiftDayKey(weekStart, 6));
    return first === last ? first : `${first}-${last}`;
}

export type AgendaItemKind = "partito" | "programma" | "telefonata";

export interface AgendaItem {
    key: string;
    at: string;
    /** «17:45», ora di Roma. */
    time: string;
    kind: AgendaItemKind;
    /** Già successo: si legge spento. */
    past: boolean;
    /** Prima del nome del locale. */
    before: string;
    venueId: string;
    venueName: string;
    /** Riga sotto: «parte da solo», «Telefonata · chiama Lorenzo». */
    detail: string | null;
    /** Solo per le telefonate ancora da fare: Chiama e Sposta. */
    appointment: CrmAppointmentWithVenue | null;
    /** Il numero del primo contatto, per «Chiama». */
    phone: string | null;
}

const CALL_DONE: Partial<Record<CrmAppointmentWithVenue["status"], string>> = {
    done: "fatta",
    no_show: "non ha risposto",
    postponed: "rimandata"
};

/**
 * La giornata [dayStart, dayEnd) in ordine d'ora: i messaggi partiti, quelli
 * in coda per quel giorno (partono da soli) e le telefonate non annullate.
 * Un messaggio in coda già scaduto si mostra adesso: parte al prossimo giro.
 */
export function agendaDayItems(input: {
    dayStart: string;
    dayEnd: string;
    now: Date;
    venues: CrmVenueListItem[];
    sent: CrmMessage[];
    queued: CrmQueuedMessage[];
    appointments: CrmAppointmentWithVenue[];
    nameOf: (userId: string | null) => string | null;
}): AgendaItem[] {
    const { dayStart, dayEnd, now, venues, sent, queued, appointments, nameOf } = input;
    const nowIso = now.toISOString();
    const inDay = (iso: string) => iso >= dayStart && iso < dayEnd;
    const byId = new Map(venues.map(v => [v.id, v]));
    const phoneOf = (venueId: string) => byId.get(venueId)?.crm_contacts.find(c => c.phone_e164)?.phone_e164 ?? null;
    const items: AgendaItem[] = [];
    const push = (item: Omit<AgendaItem, "time" | "phone">) =>
        items.push({ ...item, time: formatCallTime(new Date(item.at)), phone: phoneOf(item.venueId) });

    for (const m of sent) {
        if (m.direction !== "out" || m.status !== "sent") continue;
        const at = m.sent_at ?? m.created_at;
        if (!inDay(at)) continue;
        push({
            key: `m-${m.id}`,
            at,
            kind: "partito",
            past: true,
            before: m.purpose ? PURPOSE_SENT[m.purpose] : "Messaggio partito a",
            venueId: m.venue_id,
            venueName: byId.get(m.venue_id)?.name ?? "Locale",
            detail: null,
            appointment: null
        });
    }
    for (const m of queued) {
        const planned = m.send_after ?? m.created_at;
        const at = planned < nowIso ? nowIso : planned;
        if (!inDay(at)) continue;
        push({
            key: `q-${m.id}`,
            at,
            kind: "programma",
            past: false,
            before: m.purpose ? PURPOSE_QUEUED[m.purpose] : "Messaggio per",
            venueId: m.venue_id,
            venueName: m.venue_name,
            detail: "parte da solo",
            appointment: null
        });
    }
    for (const a of appointments) {
        if (a.status === "cancelled" || !inDay(a.starts_at)) continue;
        const caller = nameOf(a.caller_user_id);
        const outcome = CALL_DONE[a.status];
        const open = a.status === "proposed" || a.status === "confirmed";
        push({
            key: `a-${a.id}`,
            at: a.starts_at,
            kind: "telefonata",
            past: !open || a.starts_at < nowIso,
            before: "",
            venueId: a.venue_id,
            venueName: a.venue_name,
            detail: ["Telefonata", caller ? `chiama ${caller}` : null, outcome ?? (a.status === "proposed" ? "da confermare" : null)]
                .filter(Boolean)
                .join(" · "),
            appointment: open ? a : null
        });
    }
    return items.sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key));
}

/**
 * Dove va la riga rossa di adesso: prima del primo elemento non ancora
 * successo. Null se il giorno non è oggi.
 */
export function nowLineIndex(items: AgendaItem[], dayStart: string, dayEnd: string, now: Date): number | null {
    const nowIso = now.toISOString();
    if (nowIso < dayStart || nowIso >= dayEnd) return null;
    const i = items.findIndex(item => item.at > nowIso || (item.kind === "programma" && item.at >= nowIso));
    return i === -1 ? items.length : i;
}

/** «Domani: telefonata con Bar Luna alle 9:30» (la prima), o nessuna. */
export function tomorrowLine(appointments: CrmAppointmentWithVenue[], tomorrowKey: string): string {
    const calls = appointments
        .filter(a => (a.status === "proposed" || a.status === "confirmed") && romeDayKey(new Date(a.starts_at)) === tomorrowKey)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    if (calls.length === 0) return "Domani: nessuna telefonata.";
    const first = `con ${calls[0].venue_name} alle ${formatCallTime(new Date(calls[0].starts_at))}`;
    return calls.length === 1 ? `Domani: telefonata ${first}.` : `Domani: ${calls.length} telefonate, la prima ${first}.`;
}
