/**
 * Agenda delle telefonate del CRM (F1-4a).
 *
 * Tabella di piattaforma `crm_appointments` (migration 20261003230000): niente
 * tenant_id, RLS su `is_platform_admin()`. Le persone scrivono solo dalle
 * funzioni `crm_*_call` (230100); l'evento su Google e i messaggi Telegram li
 * fa l'edge `crm-agenda` (subito) o il cron ogni 5 minuti.
 */
import { supabase } from "@/services/supabase/client";
import type {
    CrmAgendaBusyResult,
    CrmAgendaSettings,
    CrmAppointment,
    CrmAppointmentWithVenue,
    CrmCallOutcome
} from "@/types/crm";

const APPOINTMENT_SELECT =
    "id, created_at, venue_id, lead_id, contact_id, starts_at, ends_at, time_set_at, caller_user_id, created_by, " +
    "status, status_reason, note, google_sync, google_error, reminder_queued_at, soon_queued_for, brief_sent_at, outcome_at, outcome_by";

const AGENDA_TIMEOUT_MS = 15_000;

/** Le telefonate del locale, dalla più recente. */
export async function listCrmVenueAppointments(venueId: string): Promise<CrmAppointment[]> {
    const { data, error } = await supabase
        .from("crm_appointments")
        .select(APPOINTMENT_SELECT)
        .eq("venue_id", venueId)
        .order("starts_at", { ascending: false })
        .limit(20);
    if (error) throw error;
    return (data ?? []) as unknown as CrmAppointment[];
}

type AppointmentWithVenueRow = CrmAppointment & { crm_venues: { name: string; city: string | null } | null };

/** Telefonate che toccano l'intervallo [from, to), col nome del locale. */
export async function listCrmAppointments(fromIso: string, toIso: string): Promise<CrmAppointmentWithVenue[]> {
    const { data, error } = await supabase
        .from("crm_appointments")
        .select(`${APPOINTMENT_SELECT}, crm_venues(name, city)`)
        .lt("starts_at", toIso)
        .gt("ends_at", fromIso)
        .order("starts_at", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as AppointmentWithVenueRow[]).map(({ crm_venues, ...row }) => ({
        ...row,
        venue_name: crm_venues?.name ?? "Locale",
        venue_city: crm_venues?.city ?? null
    }));
}

/** Confermate e già finite senza esito: «Com'è andata?» ancora da dire. */
export async function listCrmCallsWithoutOutcome(nowIso: string): Promise<CrmAppointmentWithVenue[]> {
    const { data, error } = await supabase
        .from("crm_appointments")
        .select(`${APPOINTMENT_SELECT}, crm_venues(name, city)`)
        .eq("status", "confirmed")
        .lte("ends_at", nowIso)
        .order("starts_at", { ascending: true })
        .limit(50);
    if (error) throw error;
    return ((data ?? []) as unknown as AppointmentWithVenueRow[]).map(({ crm_venues, ...row }) => ({
        ...row,
        venue_name: crm_venues?.name ?? "Locale",
        venue_city: crm_venues?.city ?? null
    }));
}

export interface CrmCallInput {
    startsAt: string;
    durationMinutes: number;
    callerUserId: string;
    allowOverlap: boolean;
}

export async function scheduleCrmCall(venueId: string, input: CrmCallInput & { note: string | null }): Promise<string> {
    const { data, error } = await supabase.rpc("crm_schedule_call", {
        p_venue_id: venueId,
        p_starts_at: input.startsAt,
        p_duration_minutes: input.durationMinutes,
        p_caller_user_id: input.callerUserId,
        p_note: input.note,
        p_allow_overlap: input.allowOverlap
    });
    if (error) throw error;
    return data as string;
}

export async function moveCrmCall(appointmentId: string, input: CrmCallInput): Promise<boolean> {
    const { data, error } = await supabase.rpc("crm_move_call", {
        p_appointment_id: appointmentId,
        p_starts_at: input.startsAt,
        p_duration_minutes: input.durationMinutes,
        p_caller_user_id: input.callerUserId,
        p_allow_overlap: input.allowOverlap
    });
    if (error) throw error;
    return Boolean(data);
}

export async function cancelCrmCall(appointmentId: string, reason: string | null): Promise<boolean> {
    const { data, error } = await supabase.rpc("crm_cancel_call", { p_appointment_id: appointmentId, p_reason: reason });
    if (error) throw error;
    return Boolean(data);
}

/** Chi deve chiamare dice sì o no. Ritorna lo stato nuovo, o null se era già deciso. */
export async function answerCrmCall(appointmentId: string, accept: boolean): Promise<string | null> {
    const { data, error } = await supabase.rpc("crm_answer_call", { p_appointment_id: appointmentId, p_accept: accept });
    if (error) throw error;
    return (data as string | null) ?? null;
}

export async function setCrmCallOutcome(appointmentId: string, outcome: CrmCallOutcome): Promise<boolean> {
    const { data, error } = await supabase.rpc("crm_set_call_outcome", {
        p_appointment_id: appointmentId,
        p_outcome: outcome
    });
    if (error) throw error;
    return Boolean(data);
}

/** Impegni tra due istanti (telefonate del CRM + calendario Google). */
export async function getCrmAgendaBusy(fromIso: string, toIso: string): Promise<CrmAgendaBusyResult> {
    const { data, error } = await supabase.functions.invoke("crm-agenda", {
        body: { action: "busy", from: fromIso, to: toIso },
        timeout: AGENDA_TIMEOUT_MS
    });
    if (error) throw error;
    return data as CrmAgendaBusyResult;
}

/**
 * Il giro dell'agenda subito (evento Google, «Puoi tu?»). Non lancia: se non
 * va, lo fa il cron entro 5 minuti.
 */
export async function runCrmAgenda(): Promise<void> {
    try {
        await supabase.functions.invoke("crm-agenda", { body: { action: "run" }, timeout: AGENDA_TIMEOUT_MS });
    } catch {
        // Il cron riprova.
    }
}

const SETTINGS_SELECT =
    "call_windows, call_duration_minutes, call_min_notice_minutes, google_calendar_id, call_confirm_message, call_reminder_message, call_soon_message";

export async function getCrmAgendaSettings(): Promise<CrmAgendaSettings> {
    const { data, error } = await supabase.from("crm_settings").select(SETTINGS_SELECT).eq("id", true).single();
    if (error) throw error;
    return data as unknown as CrmAgendaSettings;
}

export async function updateCrmAgendaSettings(patch: Partial<CrmAgendaSettings>): Promise<void> {
    const { error } = await supabase.from("crm_settings").update(patch).eq("id", true);
    if (error) throw error;
}
