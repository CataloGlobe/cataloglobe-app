// Rubrica clienti — service layer.
//
// Legge dalle view `v_reservation_guests_directory` / `v_reservation_guest_visits`
// e scrive SOLO note e tag su `reservation_guests`. Non esiste una create: i
// profili nascono dal trigger `reservations_link_guest` a ogni prenotazione, e
// il DB non ha nemmeno una policy INSERT per `authenticated`.
//
// Non esiste e non deve esistere una funzione di export o di invio massivo:
// la rubrica serve a erogare il servizio, non a fare marketing (il consenso
// per quello non lo raccogliamo).
//
// Ogni query filtra `tenant_id` esplicitamente oltre alla RLS (difesa in
// profondità, come `listOrdersHistoryToday`).

import { supabase } from "./client";
import { normalizePhoneToE164 } from "@/utils/phoneNormalize";
import type {
    ReservationGuestNotesInput,
    ReservationGuestSummary,
    ReservationGuestVisit,
    V2ReservationGuest
} from "@/types/reservationGuest";

/** Tetto di righe per la lista. Oltre, si cerca invece di scorrere. */
const DIRECTORY_LIMIT = 200;

/**
 * Ripulisce il termine di ricerca dai caratteri che hanno un significato nel
 * filtro PostgREST (`,` separa i termini di `.or()`, `%`/`*` sono wildcard,
 * le parentesi chiudono il gruppo). Senza questo, un nome con una virgola
 * spezzerebbe la query invece di non trovare nulla.
 */
function sanitizeSearchTerm(raw: string): string {
    return raw.trim().replace(/[%*(),.]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Elenco rubrica per l'azienda, opzionalmente filtrato per nome o telefono.
 *
 * La view esclude già i profili senza alcuna visita visibile al chiamante:
 * un manager di una sola sede non vede clienti che non ha mai servito.
 */
export async function listReservationGuests(
    tenantId: string,
    search?: string
): Promise<ReservationGuestSummary[]> {
    let query = supabase
        .from("v_reservation_guests_directory")
        .select("*")
        .eq("tenant_id", tenantId);

    const term = search ? sanitizeSearchTerm(search) : "";
    if (term.length > 0) {
        // Il telefono si cerca sia com'è stato digitato sia in forma canonica:
        // chi scrive "345 155 9558" cerca la stessa persona di "+39345…".
        const e164 = normalizePhoneToE164(term);
        const digits = term.replace(/\D/g, "");
        const filters = [
            `display_name.ilike.%${term}%`,
            `email.ilike.%${term}%`
        ];
        if (e164) filters.push(`phone_e164.eq.${e164}`);
        if (digits.length >= 3) filters.push(`phone_e164.ilike.%${digits}%`);
        query = query.or(filters.join(","));
    }

    // Chi è passato di recente prima: la rubrica si consulta per il servizio di
    // stasera, non per l'archivio.
    const { data, error } = await query
        .order("last_visit_date", { ascending: false, nullsFirst: false })
        .limit(DIRECTORY_LIMIT);

    if (error) throw error;
    return (data ?? []) as ReservationGuestSummary[];
}

/** Profilo singolo con aggregati. Throw `PGRST116` se non visibile. */
export async function getReservationGuest(
    id: string,
    tenantId: string
): Promise<ReservationGuestSummary> {
    const { data, error } = await supabase
        .from("v_reservation_guests_directory")
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        const notFound = new Error("Cliente non trovato");
        (notFound as unknown as { code: string }).code = "PGRST116";
        throw notFound;
    }
    return data as ReservationGuestSummary;
}

/**
 * Storico visite del profilo, dalla più recente.
 *
 * Contiene SOLO le visite avvenute in sedi su cui il chiamante ha
 * `reservations.read`: il filtro è della RLS, non di questa funzione.
 */
export async function listReservationGuestVisits(
    guestId: string,
    tenantId: string
): Promise<ReservationGuestVisit[]> {
    const { data, error } = await supabase
        .from("v_reservation_guest_visits")
        .select("*")
        .eq("guest_id", guestId)
        .eq("tenant_id", tenantId)
        .order("reservation_date", { ascending: false })
        .order("reservation_time", { ascending: false });

    if (error) throw error;
    return (data ?? []) as ReservationGuestVisit[];
}

/**
 * Aggiorna note del locale e tag. Nient'altro è scrivibile: identità e
 * contatti sono snapshot delle prenotazioni, li riscrive il trigger.
 */
export async function updateReservationGuestNotes(
    id: string,
    tenantId: string,
    input: ReservationGuestNotesInput
): Promise<V2ReservationGuest> {
    const { data, error } = await supabase
        .from("reservation_guests")
        .update({
            venue_notes: input.venue_notes,
            tags: input.tags
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("*")
        .single();

    if (error) throw error;
    return data as V2ReservationGuest;
}

/**
 * Lookup per telefono, usato durante l'inserimento manuale.
 *
 * `rawPhone` è il valore digitato dall'operatore in qualunque formato: viene
 * canonicalizzato qui con la stessa funzione che scrive
 * `reservations.customer_phone_e164`, altrimenti si cercherebbe con una chiave
 * diversa da quella con cui i profili sono indicizzati.
 *
 * Ritorna `null` — e non lancia — anche quando il chiamante non ha
 * `guests.read`: in quel caso la RLS non restituisce righe e il form deve
 * semplicemente non mostrare nulla, non rompersi.
 */
export async function findReservationGuestByPhone(
    tenantId: string,
    rawPhone: string
): Promise<ReservationGuestSummary | null> {
    const e164 = normalizePhoneToE164(rawPhone);
    if (!e164) return null;

    const { data, error } = await supabase
        .from("v_reservation_guests_directory")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("phone_e164", e164)
        .maybeSingle();

    if (error) throw error;
    return (data as ReservationGuestSummary | null) ?? null;
}
