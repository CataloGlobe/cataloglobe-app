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

// ─── ADMIN-SIDE (edge function `respond-reservation`, authenticated) ────────

export type RespondReservationAction = "confirm" | "decline" | "cancel";

export interface RespondReservationResult {
    success: true;
    reservation_id: string;
    status: "confirmed" | "declined" | "cancelled";
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
