/**
 * Agenda delle telefonate (F1-4a): parole, bozze e controlli della card
 * «Telefonata», della pagina Agenda e delle impostazioni. Puro.
 * Le regole degli orari stanno in `@shared/crmCallSlots` (le usa anche l'edge).
 */
import type { StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import type {
    CrmAgendaBusy,
    CrmAgendaSettings,
    CrmAppointment,
    CrmAppointmentStatus,
    CrmCallOutcome,
    CrmCallWindow
} from "@/types/crm";
import {
    CALL_DAY_LABELS,
    formatCallDay,
    formatCallTime,
    isInsideCallWindows,
    overlapsOf,
    parseCallWindows,
    plannedReminderAt,
    romeDayKey,
    romeParts,
    romeWallClock,
    type BusyInterval
} from "@shared/crmCallSlots";

export const CRM_APPOINTMENT_STATUS_LABEL: Record<CrmAppointmentStatus, string> = {
    proposed: "Da confermare",
    confirmed: "Fissata",
    cancelled: "Annullata",
    done: "Fatta",
    no_show: "Non ha risposto",
    postponed: "Rimandata"
};

export const CRM_APPOINTMENT_STATUS_VARIANT: Record<CrmAppointmentStatus, StatusBadgeVariant> = {
    proposed: "warning",
    confirmed: "info",
    cancelled: "neutral",
    done: "success",
    no_show: "danger",
    postponed: "neutral"
};

export const CRM_CALL_OUTCOME_LABEL: Record<CrmCallOutcome, string> = {
    done: "Fatta",
    no_show: "Non ha risposto",
    postponed: "Rimandata"
};

export function isActiveAppointment(a: Pick<CrmAppointment, "status">): boolean {
    return a.status === "proposed" || a.status === "confirmed";
}

/** «giovedì 8 alle 17:45, 10 minuti». */
export function describeCallTime(a: Pick<CrmAppointment, "starts_at" | "ends_at">): string {
    const start = new Date(a.starts_at);
    const minutes = Math.round((new Date(a.ends_at).getTime() - start.getTime()) / 60_000);
    return `${formatCallDay(start)} alle ${formatCallTime(start)}, ${minutes} minuti`;
}

/** Cosa succede al lead: conferma, promemoria, o perché no. */
export function describeLeadMessages(
    a: Pick<CrmAppointment, "starts_at" | "time_set_at" | "status" | "reminder_queued_at">,
    settings: Pick<CrmAgendaSettings, "call_confirm_message" | "call_reminder_message"> | null
): string {
    if (a.status === "proposed") return "Al lead parte la conferma solo quando chi chiama dice sì.";
    if (!settings) return "";
    const parts: string[] = [];
    parts.push(settings.call_confirm_message ? "Conferma al lead su WhatsApp." : "Conferma spenta (testo non impostato).");
    if (!settings.call_reminder_message) {
        parts.push("Promemoria spento (testo non impostato).");
    } else if (a.reminder_queued_at) {
        parts.push("Promemoria già in coda.");
    } else {
        const at = plannedReminderAt(new Date(a.starts_at), new Date(a.time_set_at));
        parts.push(
            at
                ? `Promemoria ${formatCallDay(at)} alle ${formatCallTime(at)}.`
                : "Niente promemoria: fissata dopo le 18 del giorno prima (basta la conferma)."
        );
    }
    return parts.join(" ");
}

// -----------------------------------------------------------------------------
// Errori delle funzioni crm_*_call (SQLSTATE dedicati, migration 20261003230100)
// -----------------------------------------------------------------------------
export function crmAgendaErrorMessage(err: unknown): string {
    const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: unknown }).code : null;
    switch (code) {
        case "CL001":
            return "Chi chiama ha già un'altra telefonata a quell'ora.";
        case "CL002":
            return "Questo locale ha già una telefonata fissata: spostala o annullala.";
        case "CL003":
            return "L'orario è già passato.";
        case "CL004":
            return "Questa telefonata non è più attiva: ricarica la scheda.";
        case "CL005":
            return "Il locale è in Perso: niente telefonate.";
        case "CL006":
            return "Può rispondere solo chi deve chiamare.";
        case "P0002":
            return "Non la trovo più: ricarica la scheda.";
        case "42501":
            return "Non hai i permessi per l'agenda.";
    }
    const message = err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? "");
    if (message.includes("invalid_duration")) return "La durata va da 5 a 120 minuti.";
    if (message.includes("not_a_team_member")) return "Chi chiama deve essere del team del CRM.";
    return "Qualcosa non ha funzionato. Riprova.";
}

// -----------------------------------------------------------------------------
// Bozza della telefonata (drawer)
// -----------------------------------------------------------------------------
export interface CallDraft {
    /** «AAAA-MM-GG» del giorno di Roma. */
    day: string;
    /** «HH:MM» di Roma. */
    time: string;
    duration: string;
    callerUserId: string;
    note: string;
}

export type CallDraftErrors = Partial<Record<"day" | "time" | "duration" | "callerUserId", string>>;

export function callDraftFrom(
    a: Pick<CrmAppointment, "starts_at" | "ends_at" | "caller_user_id" | "note"> | null,
    defaults: { durationMinutes: number; callerUserId: string; start?: Date | null }
): CallDraft {
    const start = a ? new Date(a.starts_at) : defaults.start ?? null;
    const minutes = a
        ? Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60_000)
        : defaults.durationMinutes;
    return {
        day: start ? romeDayKey(start) : "",
        time: start ? formatCallTime(start) : "",
        duration: String(minutes),
        callerUserId: a?.caller_user_id ?? defaults.callerUserId,
        note: a?.note ?? ""
    };
}

/** L'istante della bozza, o null se giorno o ora mancano o sono storti. */
export function callDraftStart(draft: Pick<CallDraft, "day" | "time">): Date | null {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(draft.day);
    const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(draft.time);
    if (!d || !t) return null;
    const start = romeWallClock(Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2]));
    // Un'ora che a Roma non esiste (cambio dell'ora) non si fissa.
    const shown = romeParts(start);
    if (shown.hour !== Number(t[1]) || shown.minute !== Number(t[2])) return null;
    return start;
}

export function validateCallDraft(draft: CallDraft, now: Date = new Date()): CallDraftErrors {
    const errors: CallDraftErrors = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.day)) errors.day = "Scegli il giorno.";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) errors.time = "Scegli l'ora.";
    const duration = Number(draft.duration);
    if (!Number.isInteger(duration) || duration < 5 || duration > 120) errors.duration = "Da 5 a 120 minuti.";
    if (!draft.callerUserId) errors.callerUserId = "Scegli chi chiama.";
    if (!errors.day && !errors.time) {
        const start = callDraftStart(draft);
        if (!start) errors.time = "Quest'ora non esiste (cambio dell'ora).";
        else if (start.getTime() <= now.getTime()) errors.time = "L'orario è già passato.";
    }
    return errors;
}

/** Avvisi che non bloccano: fuori dalle fasce, poco preavviso. */
export function callDraftWarnings(
    draft: CallDraft,
    settings: Pick<CrmAgendaSettings, "call_windows" | "call_min_notice_minutes"> | null,
    now: Date = new Date()
): string[] {
    const start = callDraftStart(draft);
    const duration = Number(draft.duration);
    if (!start || !settings || !Number.isInteger(duration)) return [];
    const out: string[] = [];
    if (!isInsideCallWindows(start, duration, settings.call_windows)) {
        out.push(`Fuori dalle fasce in cui si chiama (${describeCallWindows(settings.call_windows)}).`);
    }
    if (start.getTime() - now.getTime() < settings.call_min_notice_minutes * 60_000) {
        out.push(`Meno di ${settings.call_min_notice_minutes} minuti di preavviso.`);
    }
    return out;
}

/** Impegni accavallati con la bozza, esclusa la telefonata che si sta spostando. */
export function callDraftOverlaps(draft: CallDraft, busy: CrmAgendaBusy[], excludeAppointmentId: string | null): CrmAgendaBusy[] {
    const start = callDraftStart(draft);
    const duration = Number(draft.duration);
    if (!start || !Number.isInteger(duration) || duration <= 0) return [];
    const end = new Date(start.getTime() + duration * 60_000);
    return busy.filter(
        b =>
            (!excludeAppointmentId || b.appointment_id !== excludeAppointmentId) &&
            overlapsOf(start, end, toBusyIntervals([b])).length > 0
    );
}

export function toBusyIntervals(busy: CrmAgendaBusy[]): BusyInterval[] {
    return busy.map(b => ({ start: new Date(b.start), end: new Date(b.end), label: b.label }));
}

// -----------------------------------------------------------------------------
// Fasce (impostazioni)
// -----------------------------------------------------------------------------
/** «lun-ven 09:00-11:00, 17:30-18:30». */
export function describeCallWindows(windows: CrmCallWindow[]): string {
    if (windows.length === 0) return "nessuna fascia";
    return windows.map(w => `${describeDays(w.days)} ${w.start}-${w.end}`).join(", ");
}

function describeDays(days: number[]): string {
    const sorted = [...days].sort((a, b) => a - b);
    const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
    if (sorted.length > 2 && contiguous) return `${CALL_DAY_LABELS[sorted[0] - 1]}-${CALL_DAY_LABELS[sorted[sorted.length - 1] - 1]}`;
    return sorted.map(d => CALL_DAY_LABELS[d - 1]).join(", ");
}

export interface WindowDraft {
    days: number[];
    start: string;
    end: string;
}

/** Fasce della bozza delle impostazioni → valore da salvare, o un errore. */
export function windowsFromDraft(drafts: WindowDraft[]): { ok: true; value: CrmCallWindow[] } | { ok: false; error: string } {
    if (drafts.some(w => w.days.length === 0)) return { ok: false, error: "Ogni fascia ha almeno un giorno." };
    const parsed = parseCallWindows(drafts.map(w => ({ days: w.days, start: w.start, end: w.end })));
    if (!parsed) return { ok: false, error: "Controlla gli orari: inizio prima della fine, formato 09:00." };
    return { ok: true, value: parsed };
}

/** Un testo al lead: vuoto = spento. Segnaposti ammessi {nome} {giorno} {ora} {locale} {mittente}. */
export function callTemplateError(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (trimmed.length > 1000) return "Al massimo 1000 caratteri.";
    const unknown = [...trimmed.matchAll(/\{([a-z_]+)\}/gi)]
        .map(m => m[1])
        .filter(name => !["nome", "giorno", "ora", "locale", "mittente"].includes(name));
    if (unknown.length) return `Segnaposto sconosciuto: {${unknown[0]}}.`;
    return null;
}

// -----------------------------------------------------------------------------
// Storia della scheda
// -----------------------------------------------------------------------------
type CallEventType = "call_scheduled" | "call_moved" | "call_cancelled" | "call_caller_answered" | "call_outcome";

function at(value: unknown): string {
    const date = new Date(String(value ?? ""));
    return Number.isNaN(date.getTime()) ? "" : `${formatCallDay(date)} alle ${formatCallTime(date)}`;
}

/** Riga della storia per gli eventi delle telefonate (payload di 20261003230100). */
export function describeCallEvent(
    type: CallEventType,
    p: Record<string, unknown>,
    teamName: (userId: string | null) => string
): string {
    switch (type) {
        case "call_scheduled": {
            const proposed = p.status === "proposed" ? ", da confermare" : "";
            return `${at(p.starts_at)}, chiama ${teamName((p.caller as string) ?? null)}${proposed}`;
        }
        case "call_moved": {
            const caller = p.caller !== p.caller_from ? `, ora chiama ${teamName((p.caller as string) ?? null)}` : "";
            return `Da ${at(p.from)} a ${at(p.starts_at)}${caller}`;
        }
        case "call_cancelled":
            return `${at(p.starts_at)}${p.reason ? `: ${String(p.reason)}` : ""}`;
        case "call_caller_answered":
            return `${at(p.starts_at)}: ${p.accepted ? "confermata da chi chiama" : "chi chiama non può, annullata"}`;
        case "call_outcome":
            return `${at(p.starts_at)}: ${CRM_CALL_OUTCOME_LABEL[p.outcome as CrmCallOutcome]?.toLowerCase() ?? String(p.outcome)}`;
    }
}
