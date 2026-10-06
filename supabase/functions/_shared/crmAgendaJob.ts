// @ts-nocheck
// =============================================================================
// Agenda del CRM (F1-4a): il lavoro delle edge, con I/O
// =============================================================================
// Lo usano crm-notify (job «agenda», dal cron ogni 5 minuti), crm-agenda
// (da /admin, subito dopo un cambio) e crm-telegram-webhook (dopo un sì).
//
//   syncAppointmentGoogle  scrive, sposta o toglie l'evento nel calendario
//   processAgenda          tutti i passi dovuti: Google, «Puoi tu?» (col
//                          sollecito e il passaggio a chi l'ha fissata),
//                          brief, «Com'è andata?»
//
// ⚠️ SYNC con crm_agenda_has_work (migration 20261004010400): le condizioni
// dei passi sono le stesse. Se cambiano qui, cambiano là (falso negativo =
// passo mai fatto; falso positivo = una chiamata a vuoto).
//
// Ogni passo si prenota scrivendo la sua colonna solo se è ancora NULL
// (claim idempotente): due giri accavallati non mandano due messaggi. Se
// l'invio non va, la prenotazione si libera e il giro dopo riprova.
//
// Env: TELEGRAM_BOT_TOKEN, GOOGLE_SERVICE_ACCOUNT_JSON (facoltativa: senza,
// gli eventi restano «da scrivere» con l'errore in scheda).
// =============================================================================

import { telegramCall } from "./telegramApi.ts";
import { CRM_STAGE_LABEL } from "./crmLabels.ts";
import { CRM_TECHNICAL_ANSWER_KEYS } from "./crmTelegram.ts";
import {
    CALLER_REMINDER_MINUTES,
    buildBriefMessage,
    buildCallerRequestMessage,
    buildHandedOverCallerText,
    buildHandedOverText,
    buildHandoverBusyQuestion,
    buildHandoverFailedText,
    buildOutcomeMessage,
    handoverAt,
    type AgendaCallInfo
} from "./crmAgendaMessages.ts";
import {
    GoogleCalendarError,
    buildCallEvent,
    deleteEvent,
    getAccessToken,
    insertEvent,
    listEvents,
    parseCalendarEvents,
    parseServiceAccount,
    patchEvent
} from "./crmGoogleCalendar.ts";
import { BRIEF_MINUTES_BEFORE, OUTCOME_MINUTES_AFTER, romeWallClock } from "./crmCallSlots.ts";
import { withRecipientLine } from "./crmRecipientLine.ts";

const LOG = "crm-agenda";
const CLAIM_MINUTES = 2;
const OUTCOME_GIVE_UP_DAYS = 3;

const APPOINTMENT_SELECT =
    "id, venue_id, lead_id, starts_at, ends_at, status, note, caller_user_id, created_by, google_event_id, google_rev, " +
    "caller_asked_at, caller_reminded_at, creator_asked_at, handover_failed_at, " +
    "crm_venues(name, city, stage), crm_contacts(name, phone_e164)";

function teamName(team, userId: string | null): string | null {
    return team.find(m => m.user_id === userId)?.display_name ?? null;
}

/**
 * Chi doveva chiamare ha chiesto a chi l'ha fissata, per l'ultimo «Puoi tu?».
 * ⚠️ SYNC con v_asked in crm_handover_call / crm_call_propose_other e con
 * crm_agenda_has_work (migration 20261004010600).
 */
export function creatorAsked(row): boolean {
    return Boolean(row.creator_asked_at && row.caller_asked_at) &&
        new Date(row.creator_asked_at).getTime() >= new Date(row.caller_asked_at).getTime();
}

export function toCallInfo(row, team): AgendaCallInfo {
    return {
        appointmentId: row.id,
        venueId: row.venue_id,
        venueName: row.crm_venues?.name ?? "Locale",
        city: row.crm_venues?.city ?? null,
        contactName: row.crm_contacts?.name ?? null,
        phone: row.crm_contacts?.phone_e164 ?? null,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        callerName: teamName(team, row.caller_user_id),
        createdByName: teamName(team, row.created_by),
        canHandOver: Boolean(row.created_by) && row.created_by !== row.caller_user_id,
        creatorAsked: creatorAsked(row),
        handoverFailed: Boolean(row.handover_failed_at),
        note: row.note ?? null
    };
}

export async function loadAppointment(supabase, id: string) {
    const { data, error } = await supabase.from("crm_appointments").select(APPOINTMENT_SELECT).eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
}

// -----------------------------------------------------------------------------
// Google
// -----------------------------------------------------------------------------
async function googleContext(supabase) {
    const { data } = await supabase.from("crm_settings").select("google_calendar_id").eq("id", true).maybeSingle();
    const calendarId = data?.google_calendar_id?.trim() || null;
    const account = parseServiceAccount(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON"));
    return { calendarId, account };
}

let cachedToken: { value: string; until: number } | null = null;

async function accessToken(account) {
    if (cachedToken && cachedToken.until > Date.now()) return cachedToken.value;
    const value = await getAccessToken(account);
    cachedToken = { value, until: Date.now() + 50 * 60_000 };
    return value;
}

/**
 * Porta il calendario allo stato della telefonata: confermata = evento c'è
 * (creato o spostato); annullata, o tornata proposta = evento tolto; fatta,
 * non ha risposto, rimandata = l'evento resta com'è.
 * Ritorna l'esito scritto in tabella, o «skipped» se un altro giro la sta già
 * scrivendo.
 */
export async function syncAppointmentGoogle(supabase, id: string, team, appUrl: string | null, now = new Date()) {
    const staleBefore = new Date(now.getTime() - CLAIM_MINUTES * 60_000).toISOString();
    const { data: claimed, error: claimError } = await supabase
        .from("crm_appointments")
        .update({ google_claimed_at: now.toISOString() })
        .eq("id", id)
        .in("google_sync", ["pending", "error"])
        .or(`google_claimed_at.is.null,google_claimed_at.lt.${staleBefore}`)
        .select("id, google_rev")
        .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return "skipped";

    const row = await loadAppointment(supabase, id);
    const rev = claimed.google_rev;
    const { calendarId, account } = await googleContext(supabase);

    let eventId = row.google_event_id ?? null;
    let result: { sync: string; error: string | null };
    try {
        if (!calendarId) {
            result = { sync: "none", error: null };
        } else if (!account) {
            result = { sync: "error", error: "Chiave dell'account di servizio Google mancante nei segreti delle edge." };
        } else {
            const token = await accessToken(account);
            if (row.status === "confirmed") {
                const info = toCallInfo(row, team);
                const event = buildCallEvent({
                    appointmentId: row.id,
                    venueName: info.venueName,
                    city: info.city,
                    contactName: info.contactName,
                    callerName: info.callerName,
                    startsAt: row.starts_at,
                    endsAt: row.ends_at,
                    leadUrl: appUrl ? `${appUrl}/admin/lead/${row.venue_id}` : null,
                    note: row.note
                });
                if (eventId) {
                    try {
                        await patchEvent(token, calendarId, eventId, event);
                    } catch (err) {
                        // Evento cancellato a mano dal calendario: si ricrea.
                        if (!(err instanceof GoogleCalendarError) || (err.status !== 404 && err.status !== 410)) throw err;
                        eventId = await insertEvent(token, calendarId, event);
                    }
                } else {
                    eventId = await insertEvent(token, calendarId, event);
                }
            } else if (row.status === "cancelled" || row.status === "proposed") {
                if (eventId) await deleteEvent(token, calendarId, eventId);
                eventId = null;
            }
            result = { sync: "ok", error: null };
        }
    } catch (err) {
        console.error(`${LOG}: Google`, err instanceof GoogleCalendarError ? err.status : "", (err as Error)?.message);
        result = {
            sync: "error",
            error: (err instanceof GoogleCalendarError ? err.message : "Google Calendar non raggiungibile.").slice(0, 300)
        };
    }

    // Si chiude solo la revisione presa in carico. Se nel frattempo la
    // telefonata è cambiata, l'id dell'evento si salva comunque e resta da
    // scrivere: il giro dopo la porta allo stato nuovo.
    const { data: closed } = await supabase
        .from("crm_appointments")
        .update({
            google_sync: result.sync,
            google_error: result.error,
            google_event_id: eventId,
            google_synced_at: result.sync === "ok" ? now.toISOString() : null,
            google_claimed_at: null
        })
        .eq("id", id)
        .eq("google_rev", rev)
        .select("id");
    if (!closed?.length) {
        await supabase.from("crm_appointments").update({ google_event_id: eventId, google_claimed_at: null }).eq("id", id);
        return "changed";
    }
    return result.sync;
}

// -----------------------------------------------------------------------------
// Telegram
// -----------------------------------------------------------------------------
async function sendTo(botToken: string, chatId: number, message) {
    return telegramCall(botToken, "sendMessage", {
        chat_id: chatId,
        text: message.text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: message.reply_markup
    });
}

/**
 * A chi chiama; se non ha collegato Telegram, a tutto il team collegato (con
 * una riga che dice per chi è). Ritorna quanti invii sono andati.
 */
/** A una persona del team; se non ha collegato Telegram, a tutti con «Per {nome}». */
export async function sendToCaller(botToken: string, team, callerId: string, message): Promise<number> {
    const caller = team.find(m => m.user_id === callerId && m.telegram_chat_id);
    const targets = caller ? [caller] : team.filter(m => m.telegram_chat_id);
    const name = teamName(team, callerId) ?? "chi chiama";
    const text = caller ? message.text : `Per ${name} (non ha collegato Telegram):\n${message.text}`;
    const targetIds = targets.map(m => m.user_id);
    let sent = 0;
    for (const m of targets) {
        const r = await sendTo(botToken, m.telegram_chat_id, withRecipientLine({ ...message, text }, team, targetIds, m.user_id));
        if (r.ok) sent += 1;
        else console.warn(`${LOG}: invio non riuscito`, m.user_id, r.description);
    }
    return sent;
}

/** Prenota una colonna-passo; ritorna la riga se la prenotazione è nostra. */
async function claimStep(supabase, id: string, column: string, now: Date, extra: Record<string, unknown> = {}) {
    const { data, error } = await supabase
        .from("crm_appointments")
        .update({ [column]: now.toISOString(), ...extra })
        .eq("id", id)
        .is(column, null)
        .select("id")
        .maybeSingle();
    if (error) throw error;
    return Boolean(data);
}

async function releaseStep(supabase, id: string, column: string) {
    await supabase.from("crm_appointments").update({ [column]: null }).eq("id", id);
}

async function briefExtras(supabase, row) {
    const extras = { stageLabel: CRM_STAGE_LABEL[row.crm_venues?.stage] ?? null, interests: [], answers: [], lastMessages: [] };
    if (row.lead_id) {
        const { data: lead } = await supabase.from("crm_leads").select("interests, form_answers").eq("id", row.lead_id).maybeSingle();
        extras.interests = lead?.interests ?? [];
        extras.answers = Object.entries(lead?.form_answers ?? {})
            .filter(([k, v]) => !CRM_TECHNICAL_ANSWER_KEYS.has(k) && v !== null && v !== undefined && String(v).trim() !== "")
            .map(([k, v]) => ({ label: k.replace(/_/g, " "), value: Array.isArray(v) ? v.join(", ") : String(v) }));
    }
    const { data: msgs } = await supabase
        .from("crm_messages")
        .select("author, body, status, direction")
        .eq("venue_id", row.venue_id)
        .not("body", "is", null)
        .order("created_at", { ascending: false })
        .limit(5);
    extras.lastMessages = (msgs ?? [])
        .filter(m => m.direction === "in" || m.status === "sent" || m.author === "person")
        .reverse()
        .map(m => ({ author: m.author, text: m.body }));
    return extras;
}

// -----------------------------------------------------------------------------
// Il giro completo
// -----------------------------------------------------------------------------
export async function processAgenda(supabase, team, botToken: string | null, appUrl: string | null, now = new Date()) {
    const stats = { google: 0, google_errors: 0, caller_requests: 0, caller_reminders: 0, handovers: 0, briefs: 0, outcomes: 0 };
    const nowIso = now.toISOString();

    // 1. Google
    const staleBefore = new Date(now.getTime() - CLAIM_MINUTES * 60_000).toISOString();
    // Errori di Google riprovati dopo 15 minuti (ogni tentativo rinfresca
    // updated_at: l'attesa si rinnova da sola).
    const retryBefore = new Date(now.getTime() - 15 * 60_000).toISOString();
    const { data: pending } = await supabase
        .from("crm_appointments")
        .select("id")
        .or(
            `and(google_sync.eq.pending,or(google_claimed_at.is.null,google_claimed_at.lt.${staleBefore})),` +
                `and(google_sync.eq.error,updated_at.lt.${retryBefore})`
        )
        .limit(20);
    for (const p of pending ?? []) {
        const r = await syncAppointmentGoogle(supabase, p.id, team, appUrl, now);
        if (r === "ok" || r === "none") stats.google += 1;
        if (r === "error") stats.google_errors += 1;
    }

    if (!botToken) return stats;
    // Nessuno collegato a Telegram: i passi si segnano fatti senza riprovare
    // ogni 5 minuti (la scheda mostra comunque tutto).
    const nobodyLinked = !team.some(m => m.telegram_chat_id);

    // 2. «Puoi tu?» a chi deve chiamare
    const { data: proposed } = await supabase
        .from("crm_appointments")
        .select(APPOINTMENT_SELECT)
        .eq("status", "proposed")
        .is("caller_asked_at", null)
        .gt("starts_at", nowIso)
        .limit(20);
    const askedNow = new Set<string>();
    for (const row of proposed ?? []) {
        // Un «Puoi tu?» nuovo (anche dopo uno spostamento, che azzera solo
        // caller_asked_at) riporta a zero il suo sollecito.
        if (!(await claimStep(supabase, row.id, "caller_asked_at", now, { caller_reminded_at: null, handover_failed_at: null }))) continue;
        askedNow.add(row.id);
        const sent = await sendToCaller(botToken, team, row.caller_user_id, buildCallerRequestMessage(toCallInfo(row, team), appUrl));
        if (sent > 0) stats.caller_requests += 1;
        else if (!nobodyLinked) await releaseStep(supabase, row.id, "caller_asked_at");
    }

    // 2b. Nessuna risposta: la telefonata passa a chi l'ha fissata (handoverAt).
    // Prima del sollecito, così non arrivano sollecito e passaggio insieme.
    const { data: waiting } = await supabase
        .from("crm_appointments")
        .select(APPOINTMENT_SELECT)
        .eq("status", "proposed")
        .not("caller_asked_at", "is", null)
        .gt("starts_at", nowIso)
        .limit(50);
    const handedOver = new Set<string>();
    for (const row of waiting ?? []) {
        // Appena chiesta in questo giro: almeno un giro per rispondere, così
        // «Puoi tu?» e passaggio non arrivano insieme.
        if (askedNow.has(row.id)) continue;
        const info = toCallInfo(row, team);
        if (!info.canHandOver || handoverAt(row.starts_at, row.caller_asked_at) > now) continue;
        const { data: status, error } = await supabase.rpc("crm_handover_call", {
            p_appointment_id: row.id,
            p_actor_user_id: null
        });
        if (error) {
            // Chi l'ha fissata ha un'altra telefonata a quell'ora o non è più
            // nel team: resta proposta, e all'orario scade come oggi.
            // L'avviso parte una volta sola (handover_failed_at), a tutti e due.
            console.warn(`${LOG}: passaggio non riuscito`, row.id, error.code);
            if (await claimStep(supabase, row.id, "handover_failed_at", now)) {
                const text = buildHandoverFailedText(info);
                // Aveva un'altra telefonata a quell'ora: a chi l'ha fissata si
                // chiede di gestirla, coi tasti per proporre un altro orario.
                const busy = error.code === "CL001" && teamName(team, row.created_by) !== null;
                await sendToCaller(
                    botToken,
                    team,
                    row.created_by,
                    busy ? buildHandoverBusyQuestion({ ...info, handoverFailed: true }, appUrl) : { text }
                );
                await sendToCaller(botToken, team, row.caller_user_id, { text });
            }
            continue;
        }
        if (status !== "confirmed") continue;
        handedOver.add(row.id);
        stats.handovers += 1;
        const asked = info.creatorAsked === true;
        await sendToCaller(botToken, team, row.created_by, { text: buildHandedOverText(info, asked) });
        await sendToCaller(botToken, team, row.caller_user_id, { text: buildHandedOverCallerText(info, asked) });
        try {
            await syncAppointmentGoogle(supabase, row.id, team, appUrl, now);
        } catch (err) {
            console.error(`${LOG}: Google dopo il passaggio`, (err as Error)?.message);
        }
    }

    // 2c. Sollecito del «Puoi tu?», una volta sola, dopo 30 minuti. Non se
    // chi doveva chiamare ha già risposto chiedendo a chi l'ha fissata.
    const remindBefore = now.getTime() - CALLER_REMINDER_MINUTES * 60_000;
    for (const row of waiting ?? []) {
        if (handedOver.has(row.id) || row.caller_reminded_at || creatorAsked(row)) continue;
        if (new Date(row.caller_asked_at).getTime() > remindBefore) continue;
        if (!(await claimStep(supabase, row.id, "caller_reminded_at", now))) continue;
        const sent = await sendToCaller(botToken, team, row.caller_user_id, buildCallerRequestMessage(toCallInfo(row, team), appUrl, true));
        if (sent > 0) stats.caller_reminders += 1;
        else if (!nobodyLinked) await releaseStep(supabase, row.id, "caller_reminded_at");
    }

    // 3. Brief un'ora prima
    const briefFrom = new Date(now.getTime() + BRIEF_MINUTES_BEFORE * 60_000).toISOString();
    const { data: briefs } = await supabase
        .from("crm_appointments")
        .select(APPOINTMENT_SELECT)
        .eq("status", "confirmed")
        .is("brief_sent_at", null)
        .lte("starts_at", briefFrom)
        .gt("ends_at", nowIso)
        .limit(20);
    for (const row of briefs ?? []) {
        if (!(await claimStep(supabase, row.id, "brief_sent_at", now))) continue;
        const message = buildBriefMessage(toCallInfo(row, team), await briefExtras(supabase, row), appUrl);
        const sent = await sendToCaller(botToken, team, row.caller_user_id, message);
        if (sent > 0) stats.briefs += 1;
        else if (!nobodyLinked) await releaseStep(supabase, row.id, "brief_sent_at");
    }

    // 4. «Com'è andata?»
    const outcomeTo = new Date(now.getTime() - OUTCOME_MINUTES_AFTER * 60_000).toISOString();
    const giveUp = new Date(now.getTime() - OUTCOME_GIVE_UP_DAYS * 24 * 60 * 60_000).toISOString();
    const { data: ended } = await supabase
        .from("crm_appointments")
        .select(APPOINTMENT_SELECT)
        .eq("status", "confirmed")
        .is("outcome_asked_at", null)
        .lte("ends_at", outcomeTo)
        .gt("ends_at", giveUp)
        .limit(20);
    for (const row of ended ?? []) {
        if (!(await claimStep(supabase, row.id, "outcome_asked_at", now))) continue;
        const sent = await sendToCaller(botToken, team, row.caller_user_id, buildOutcomeMessage(toCallInfo(row, team), appUrl));
        if (sent > 0) stats.outcomes += 1;
        else if (!nobodyLinked) await releaseStep(supabase, row.id, "outcome_asked_at");
    }

    return stats;
}

// -----------------------------------------------------------------------------
// Impegni (crm-agenda «busy», agente F1-3 per gli orari da proporre)
// -----------------------------------------------------------------------------
function romeDayStart(day: string): string {
    const [y, m, d] = day.split("-").map(Number);
    return romeWallClock(y, m, d, 0, 0).toISOString();
}

/** Impegni tra due istanti: telefonate attive del CRM + eventi del calendario Google. */
export async function loadAgendaBusy(supabase, team, from: Date, to: Date) {
    const { data: rows, error } = await supabase
        .from("crm_appointments")
        .select("id, starts_at, ends_at, caller_user_id, crm_venues(name)")
        .in("status", ["proposed", "confirmed"])
        .lt("starts_at", to.toISOString())
        .gt("ends_at", from.toISOString());
    if (error) throw error;
    const crm = (rows ?? []).map(r => {
        const caller = team.find(m => m.user_id === r.caller_user_id)?.display_name;
        return {
            start: new Date(r.starts_at).toISOString(),
            end: new Date(r.ends_at).toISOString(),
            label: `Telefonata: ${r.crm_venues?.name ?? "locale"}${caller ? ` (chiama ${caller})` : ""}`,
            appointment_id: r.id,
            caller_user_id: r.caller_user_id
        };
    });

    const { data: settings } = await supabase.from("crm_settings").select("google_calendar_id").eq("id", true).maybeSingle();
    const calendarId = settings?.google_calendar_id?.trim() || null;
    const account = parseServiceAccount(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON"));
    if (!calendarId) return { google: "off", google_error: null, busy: crm };
    if (!account) {
        return { google: "error", google_error: "Chiave dell'account di servizio Google mancante.", busy: crm };
    }
    try {
        const token = await getAccessToken(account);
        const items = await listEvents(token, calendarId, from.toISOString(), to.toISOString());
        // Gli eventi creati dal CRM ci sono già come telefonate: non si contano due volte.
        const known = new Set(crm.map(c => c.appointment_id));
        const google = parseCalendarEvents(items, romeDayStart)
            .filter(e => !e.appointmentId || !known.has(e.appointmentId))
            .map(e => ({ start: e.start, end: e.end, label: e.label, appointment_id: e.appointmentId, caller_user_id: null }));
        return { google: "ok", google_error: null, busy: [...crm, ...google] };
    } catch (err) {
        console.error("crm-agenda: Google", (err as Error)?.message);
        return { google: "error", google_error: "Calendario Google non raggiungibile.", busy: crm };
    }
}
