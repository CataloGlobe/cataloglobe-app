/**
 * Reservations service.
 *
 * Lettura: SELECT diretti via RLS authenticated (policy activity-scoped via
 * has_permission('reservations.read', activity_id)). Le transizioni di stato
 * lato admin passano da edge function dedicate (concern futuro).
 *
 * Scrittura customer-side: `submitReservation` invoca la edge function
 * pubblica `submit-reservation` (verify_jwt=false). Il tenant_id viene
 * derivato server-side dall'activity risolta via slug; il frontend non lo
 * fornisce mai.
 *
 * Tenant filter difensivo (`.eq("tenant_id", tenantId)`) sui SELECT anche se
 * RLS gia' filtra: stesso pattern degli altri service del progetto, isola
 * query cross-tenant in fase di sviluppo / con bug RLS.
 */

import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";
import { normalizePhoneToE164 } from "@/utils/phoneNormalize";
import type { V2Reservation } from "@/types/reservation";

/**
 * Lista prenotazioni di un tenant. Ordinate per data + ora ascendente
 * (prossime in cima).
 *
 * RLS activity-scoped filtra automaticamente alle sedi su cui il caller
 * ha il permesso `reservations.read`.
 */
export async function listReservations(tenantId: string): Promise<V2Reservation[]> {
    const { data, error } = await supabase
        .from("reservations")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("reservation_date", { ascending: true })
        .order("reservation_time", { ascending: true });

    if (error) throw error;
    return (data ?? []) as V2Reservation[];
}

/**
 * Get singolo per id + tenant. Throw con `.code = "PGRST116"` se non trovato
 * (stesso shape degli altri get* del progetto).
 */
export async function getReservation(
    id: string,
    tenantId: string
): Promise<V2Reservation> {
    const { data, error } = await supabase
        .from("reservations")
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        const notFound = new Error("Prenotazione non trovata");
        (notFound as unknown as { code: string }).code = "PGRST116";
        throw notFound;
    }
    return data as V2Reservation;
}

// ─── ADMIN-SIDE (inserimento manuale + modifica, RLS authenticated) ────────

export interface CreateReservationInput {
    activity_id: string;
    reservation_date: string;
    reservation_time: string;
    party_size: number;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    notes?: string | null;
}

export interface UpdateReservationInput {
    reservation_date: string;
    reservation_time: string;
    party_size: number;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    notes?: string | null;
}

/**
 * Inserisce una prenotazione "a mano" (telefonica / walk-in). Status forzato
 * a `confirmed`: nessuna email di notifica al cliente in questa versione.
 *
 * Auth: INSERT diretto via client autenticato. RLS gate:
 *   has_permission('reservations.manage', activity_id)
 */
export async function createReservation(
    tenantId: string,
    input: CreateReservationInput
): Promise<V2Reservation> {
    const { data, error } = await supabase
        .from("reservations")
        .insert({
            tenant_id: tenantId,
            activity_id: input.activity_id,
            reservation_date: input.reservation_date,
            reservation_time: input.reservation_time,
            party_size: input.party_size,
            customer_name: input.customer_name,
            customer_email: input.customer_email,
            customer_phone: input.customer_phone,
            // Forma canonica a fianco del grezzo. Una prenotazione presa al
            // telefono è quella di un cliente abituale come le altre: se non
            // la normalizziamo qui, il profilo ospite nasce monco. null
            // quando il numero non è interpretabile — il grezzo resta.
            customer_phone_e164: normalizePhoneToE164(input.customer_phone),
            notes: input.notes ?? null,
            status: "confirmed",
            source: "manual"
        })
        .select("*")
        .single();

    if (error) throw error;
    return data as V2Reservation;
}

/**
 * Aggiorna SOLO i campi dati della prenotazione. Lo status NON e' modificabile
 * qui: le transizioni restano sotto `respond-reservation` (confirm/decline/
 * cancel). Nessuna email su edit in questa versione.
 *
 * Auth: UPDATE diretto via client autenticato. RLS gate USING + WITH CHECK:
 *   has_permission('reservations.manage', activity_id)
 */
export async function updateReservation(
    id: string,
    tenantId: string,
    input: UpdateReservationInput
): Promise<V2Reservation> {
    const { data, error } = await supabase
        .from("reservations")
        .update({
            reservation_date: input.reservation_date,
            reservation_time: input.reservation_time,
            party_size: input.party_size,
            customer_name: input.customer_name,
            customer_email: input.customer_email,
            customer_phone: input.customer_phone,
            // Ricalcolata a ogni edit: il grezzo può cambiare, la canonica
            // deve seguirlo (o tornare null se il nuovo valore non è
            // interpretabile — mai lasciare la canonica di un altro numero).
            customer_phone_e164: normalizePhoneToE164(input.customer_phone),
            notes: input.notes ?? null,
            updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("*")
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        const notFound = new Error("Prenotazione non trovata");
        (notFound as unknown as { code: string }).code = "PGRST116";
        throw notFound;
    }
    return data as V2Reservation;
}

// ─── CUSTOMER-SIDE (edge function `submit-reservation`, public) ─────────────

export interface SubmitReservationInput {
    slug: string;
    reservation_date: string;
    reservation_time: string;
    party_size: number;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    notes?: string;
    /**
     * Lingua corrente della pagina pubblica (`i18n.language`) al momento del
     * submit. L'Edge la valida di forma e la persiste su
     * `reservations.customer_language`: è ciò che decide in che lingua il
     * cliente riceverà ricevuta, conferma, promemoria ed esito.
     *
     * Omesso → colonna NULL, email in italiano. Mai un errore di validazione:
     * nessuna prenotazione si perde per la lingua in cui è stata presa.
     */
    language?: string;
}

export type SubmitReservationStatus = "pending" | "confirmed";

export interface SubmitReservationResult {
    success: true;
    reservation_id: string;
    /** Status risolto dalla RPC `place_online_reservation` (Step 3).
     *  - `confirmed` → auto-conferma (sede in modalità auto + capienza ok).
     *  - `pending`   → in attesa di gestione admin (default + soft-over). */
    status: SubmitReservationStatus;
}

/**
 * Invia una nuova richiesta di prenotazione. Edge function pubblica:
 * tenant_id/activity_id derivati server-side dallo slug, mai dal client.
 *
 * Errori (throw Error con `.code = <ERROR_CODE>` per branching UI):
 *   ACTIVITY_NOT_FOUND       → 404, slug non risolto
 *   ACTIVITY_NOT_ACTIVE      → 409, sede sospesa
 *   RESERVATIONS_DISABLED    → 409, sede ha enable_reservations=false
 *   CAPACITY_FULL            → 409, capienza superata con overbooking_form='hard'
 *                             (details.capacity, details.peak_with_candidate,
 *                              details.duration_minutes disponibili)
 *   PACING_FULL              → 409, tetto di pacing della fascia oraria
 *                             raggiunto. Fatto DIVERSO da CAPACITY_FULL: il
 *                             locale non è pieno, è quell'orario ad avere già
 *                             troppi arrivi — un orario vicino è probabilmente
 *                             libero, e la UI deve dirlo.
 *                             `details.reason` distingue 'pacing_covers' da
 *                             'pacing_bookings' (le due leve sono
 *                             indipendenti); `details.peak_with_candidate` è
 *                             null su questo ramo.
 *   INVALID_DATE / DATE_IN_PAST / INVALID_TIME / INVALID_EMAIL /
 *   INVALID_PARTY_SIZE / NOTES_TOO_LONG / INVALID_PAYLOAD → 400
 *   SERVER_ERROR             → 500 / network / fallback
 */
export async function submitReservation(
    input: SubmitReservationInput
): Promise<SubmitReservationResult> {
    const { data, error } = await supabase.functions.invoke<SubmitReservationResult>(
        "submit-reservation",
        { body: input }
    );

    if (error) {
        let code = "SERVER_ERROR";
        let message: string | undefined;
        let details: unknown;
        if (error instanceof FunctionsHttpError) {
            try {
                const body = (await error.context.clone().json()) as {
                    error_code?: unknown;
                    message?: unknown;
                    details?: unknown;
                };
                if (typeof body?.error_code === "string") code = body.error_code;
                if (typeof body?.message === "string") message = body.message;
                details = body?.details;
            } catch {
                // body not JSON → keep defaults
            }
        }
        const err = new Error(message ?? code);
        (err as Error & { code?: string; details?: unknown }).code = code;
        (err as Error & { code?: string; details?: unknown }).details = details;
        throw err;
    }

    if (!data) {
        const err = new Error("Risposta vuota dal server");
        (err as unknown as { code: string }).code = "SERVER_ERROR";
        throw err;
    }
    return data;
}

// ─── CUSTOMER-SIDE (edge `reservation-availability`, pubblica) ─────────────

export interface ReservationAvailabilityInput {
    slug: string;
    reservation_date: string;
    party_size: number;
    /** Orari "HH:MM" che il picker ha già deciso di mostrare. Max 96. */
    times: string[];
}

export interface ReservationAvailabilitySlot {
    time: string;
    available: boolean;
}

/**
 * Chiede quali fra gli orari proposti accettano una prenotazione per N persone.
 *
 * La griglia la possiede il CLIENT: quali orari esistano dipende da orari di
 * apertura, chiusure e coda oltre mezzanotte (`reservationSlots.ts`). Il server
 * risponde solo sullo stato, e non restituisce nulla sull'occupazione reale —
 * né posti residui, né tetti, né il motivo del blocco.
 *
 * La risposta è una fotografia di qualche secondo prima: la verità resta il
 * ricontrollo sotto lock al submit. Chi chiama deve trattare un fallimento
 * come "non lo so", NON come "tutto pieno": la griglia torna ottimista e il
 * gate resta al submit. Un errore di rete non deve impedire di prenotare.
 *
 * Errori (`.code` su Error):
 *   INVALID_PAYLOAD → 400
 *   UNAVAILABLE     → 409, sede non consultabile (inesistente, sospesa,
 *                     prenotazioni disattivate, abbonamento, piano). Unico
 *                     codice per tutti: nessun oracolo sull'esistenza.
 *   RATE_LIMITED    → 429
 *   SERVER_ERROR    → 500 / rete / fallback
 */
export async function getReservationAvailability(
    input: ReservationAvailabilityInput
): Promise<ReservationAvailabilitySlot[]> {
    const { data, error } = await supabase.functions.invoke<{
        slots: ReservationAvailabilitySlot[];
    }>("reservation-availability", { body: input });

    if (error) {
        let code = "SERVER_ERROR";
        let message: string | undefined;
        if (error instanceof FunctionsHttpError) {
            try {
                const body = (await error.context.clone().json()) as {
                    error_code?: unknown;
                    message?: unknown;
                };
                if (typeof body?.error_code === "string") code = body.error_code;
                if (typeof body?.message === "string") message = body.message;
            } catch {
                // body non JSON → restano i default
            }
        }
        const err = new Error(message ?? code);
        (err as Error & { code?: string }).code = code;
        throw err;
    }

    return Array.isArray(data?.slots) ? data.slots : [];
}

// ─── CUSTOMER-SIDE (edge `cancel-reservation-public`, link firmato) ─────────

/** Riepilogo mostrato al cliente sulla pagina di disdetta.
 *  Volutamente ristretto: nessuna nota, nessun id di sistema, nessun contatto. */
export interface ReservationCancellationSummary {
    venue_name: string;
    reservation_date: string;
    reservation_time: string;
    party_size: number;
    customer_name: string;
    status: "pending" | "confirmed" | "declined" | "cancelled" | "seated" | "no_show" | "completed";
    can_cancel: boolean;
    cutoff_minutes: number;
    /** Popolato solo quando `can_cancel` è false E la sede pubblica il numero. */
    venue_phone: string | null;
}

export interface ReadReservationCancellationResult {
    success: true;
    reservation: ReservationCancellationSummary;
}

export interface CancelReservationByCustomerResult {
    success: true;
    status: "cancelled";
    /** true quando la prenotazione era già annullata: esito idempotente, non errore. */
    already_cancelled: boolean;
    reservation: ReservationCancellationSummary;
}

/**
 * Legge il riepilogo della prenotazione a partire dal token firmato.
 *
 * Sola lettura: non annulla nulla e non tocca la riga. È l'operazione che i
 * client di posta possono invocare da soli quando generano l'anteprima del
 * link, quindi non deve avere alcun effetto.
 *
 * Errori (`.code` su Error):
 *   INVALID_LINK  → 404, token non valido O prenotazione inesistente. I due
 *                   casi sono indistinguibili per scelta: nessun oracolo.
 *   RATE_LIMITED  → 429
 *   SERVER_ERROR  → 500 / rete / fallback
 */
export async function readReservationCancellation(
    token: string
): Promise<ReadReservationCancellationResult> {
    return await invokeReservationCancellation<ReadReservationCancellationResult>(token, "read");
}

/**
 * Annulla la prenotazione dal link firmato.
 *
 * Il limite temporale viene ricalcolato server-side dai dati della riga: il
 * `can_cancel` ottenuto da `readReservationCancellation` serve solo a decidere
 * cosa disegnare, non è un input della decisione.
 *
 * Errori (`.code` su Error):
 *   INVALID_LINK                → 404, come sopra
 *   CANCELLATION_WINDOW_CLOSED  → 409, oltre il cutoff
 *                                 (details.venue_phone, details.cutoff_minutes)
 *   NOT_CANCELLABLE             → 409, stato non annullabile
 *                                 (details.current_status quando disponibile)
 *   RATE_LIMITED                → 429
 *   SERVER_ERROR                → 500 / rete / fallback
 */
export async function cancelReservationByCustomer(
    token: string
): Promise<CancelReservationByCustomerResult> {
    return await invokeReservationCancellation<CancelReservationByCustomerResult>(token, "cancel");
}

async function invokeReservationCancellation<T>(
    token: string,
    action: "read" | "cancel"
): Promise<T> {
    const { data, error } = await supabase.functions.invoke<T>("cancel-reservation-public", {
        body: { token, action }
    });

    if (error) {
        let code = "SERVER_ERROR";
        let message: string | undefined;
        let details: unknown;
        if (error instanceof FunctionsHttpError) {
            try {
                const body = (await error.context.clone().json()) as {
                    error_code?: unknown;
                    message?: unknown;
                    details?: unknown;
                };
                if (typeof body?.error_code === "string") code = body.error_code;
                if (typeof body?.message === "string") message = body.message;
                details = body?.details;
            } catch {
                // body not JSON → keep defaults
            }
        }
        const err = new Error(message ?? code);
        (err as Error & { code?: string; details?: unknown }).code = code;
        (err as Error & { code?: string; details?: unknown }).details = details;
        throw err;
    }

    if (!data) {
        const err = new Error("Risposta vuota dal server");
        (err as unknown as { code: string }).code = "SERVER_ERROR";
        throw err;
    }
    return data;
}

// ─── CUSTOMER-SIDE (edge `confirm-reservation-attendance`, link firmato) ────

/** Riepilogo mostrato al cliente sulla pagina di conferma presenza. */
export interface ReservationAttendanceSummary {
    venue_name: string;
    reservation_date: string;
    reservation_time: string;
    party_size: number;
    customer_name: string;
    status: "pending" | "confirmed" | "declined" | "cancelled" | "seated" | "no_show" | "completed";
    /** ISO timestamp della PRIMA conferma, o null se non ha ancora risposto. */
    guest_confirmed_at: string | null;
    can_confirm: boolean;
}

export interface ReadReservationAttendanceResult {
    success: true;
    reservation: ReservationAttendanceSummary;
}

export interface ConfirmReservationAttendanceResult {
    success: true;
    /** true quando aveva già confermato: esito idempotente, non errore. */
    already_confirmed: boolean;
    reservation: ReservationAttendanceSummary;
}

/**
 * Legge il riepilogo per la pagina di conferma presenza. Sola lettura.
 *
 * Il token richiesto porta `act: "confirm"`: un link di disdetta qui non vale.
 *
 * Errori (`.code`): INVALID_LINK (404, token non valido o prenotazione
 * inesistente — indistinguibili per scelta), RATE_LIMITED, SERVER_ERROR.
 */
export async function readReservationAttendance(
    token: string
): Promise<ReadReservationAttendanceResult> {
    return await invokeAttendance<ReadReservationAttendanceResult>(token, "read");
}

/**
 * Registra che il cliente ha confermato la presenza.
 *
 * NON cambia lo stato della prenotazione: resta `confirmed`, si valorizza solo
 * `guest_confirmed_at`. Idempotente: premere due volte non è un errore e non
 * sovrascrive il timestamp originale.
 *
 * Errori (`.code`): INVALID_LINK, NOT_CONFIRMABLE (409, con
 * `details.current_status`), RATE_LIMITED, SERVER_ERROR.
 */
export async function confirmReservationAttendance(
    token: string
): Promise<ConfirmReservationAttendanceResult> {
    return await invokeAttendance<ConfirmReservationAttendanceResult>(token, "confirm");
}

async function invokeAttendance<T>(token: string, action: "read" | "confirm"): Promise<T> {
    const { data, error } = await supabase.functions.invoke<T>(
        "confirm-reservation-attendance",
        { body: { token, action } }
    );

    if (error) {
        let code = "SERVER_ERROR";
        let message: string | undefined;
        let details: unknown;
        if (error instanceof FunctionsHttpError) {
            try {
                const body = (await error.context.clone().json()) as {
                    error_code?: unknown;
                    message?: unknown;
                    details?: unknown;
                };
                if (typeof body?.error_code === "string") code = body.error_code;
                if (typeof body?.message === "string") message = body.message;
                details = body?.details;
            } catch {
                // body not JSON → keep defaults
            }
        }
        const err = new Error(message ?? code);
        (err as Error & { code?: string; details?: unknown }).code = code;
        (err as Error & { code?: string; details?: unknown }).details = details;
        throw err;
    }

    if (!data) {
        const err = new Error("Risposta vuota dal server");
        (err as unknown as { code: string }).code = "SERVER_ERROR";
        throw err;
    }
    return data;
}

// ─── ADMIN-SIDE (edge function `respond-reservation`, authenticated) ────────

export type RespondReservationAction =
    | "confirm"
    | "decline"
    | "cancel"
    | "mark_no_show"
    | "undo_no_show";

export interface RespondReservationResult {
    success: true;
    reservation_id: string;
    status: "confirmed" | "declined" | "cancelled" | "no_show";
}

/**
 * Conferma / rifiuta / annulla una prenotazione. Auth: il JWT dell'utente
 * loggato viene iniettato automaticamente da `supabase.functions.invoke`.
 * L'edge function UPDATE-a la riga sotto la RLS del chiamante; l'unica
 * autorizzazione richiesta e' `reservations.manage` sulla sede della
 * prenotazione.
 *
 * Errori (`.code` su Error per branching UI):
 *   UNAUTHORIZED            → 401, JWT mancante/invalido
 *   INVALID_ACTION          → 400, action non in {confirm,decline,cancel}
 *   INVALID_PAYLOAD         → 400, reservation_id mancante/non UUID
 *   RESERVATION_NOT_FOUND   → 404, riga inesistente o non visibile (no read)
 *   INVALID_TRANSITION      → 409, riga in stato sbagliato per l'action
 *                             (details.current_status disponibile)
 *   SERVER_ERROR            → 500 / network / fallback
 */
export async function respondReservation(
    reservationId: string,
    action: RespondReservationAction
): Promise<RespondReservationResult> {
    const { data, error } = await supabase.functions.invoke<RespondReservationResult>(
        "respond-reservation",
        { body: { reservation_id: reservationId, action } }
    );

    if (error) {
        let code = "SERVER_ERROR";
        let message: string | undefined;
        let details: unknown;
        if (error instanceof FunctionsHttpError) {
            try {
                const body = (await error.context.clone().json()) as {
                    error_code?: unknown;
                    message?: unknown;
                    details?: unknown;
                };
                if (typeof body?.error_code === "string") code = body.error_code;
                if (typeof body?.message === "string") message = body.message;
                details = body?.details;
            } catch {
                // body not JSON → keep defaults
            }
        }
        const err = new Error(message ?? code);
        (err as Error & { code?: string; details?: unknown }).code = code;
        (err as Error & { code?: string; details?: unknown }).details = details;
        throw err;
    }

    if (!data) {
        const err = new Error("Risposta vuota dal server");
        (err as unknown as { code: string }).code = "SERVER_ERROR";
        throw err;
    }
    return data;
}
