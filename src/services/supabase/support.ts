/**
 * Support service — ticket di supporto azienda ↔ piattaforma.
 *
 * ── Un solo service per due lati ────────────────────────────────────────────
 * Le stesse query servono il cliente e la piattaforma: è RLS a decidere cosa
 * ciascuno vede, non questo file. La policy SELECT di `support_tickets` è
 *
 *     (tenant_id IN (SELECT get_my_tenant_ids())
 *      AND has_permission_any_activity('support.read', tenant_id))
 *     OR is_platform_admin()
 *
 * quindi `getTicket` e `listMessages` sono identiche per entrambi: un cliente
 * vede solo la propria azienda, un platform admin vede tutti i tenant. La
 * separazione in due blocchi qui sotto è documentale, non un confine di
 * sicurezza — quello vive nelle policy (migration 20260827100000).
 *
 * ── Cosa questo file NON fa, di proposito ───────────────────────────────────
 * Nessuna di queste regole è replicata qui, perché è già garantita a DB e una
 * seconda copia potrebbe solo divergere:
 *   - `created_at` / `last_message_at`  → trigger BEFORE INSERT
 *   - `author_kind`                     → policy INSERT disgiunte
 *   - riapertura del ticket chiuso      → trigger AFTER INSERT
 *   - UPDATE del ticket ai soli platform admin, DELETE negata a tutti → RLS
 *
 * ── Filtro tenant difensivo ─────────────────────────────────────────────────
 * `.eq("tenant_id", tenantId)` sulle query lato cliente anche dove RLS già
 * filtra, come in `reservations.ts`: isola query cross-tenant in sviluppo o
 * con una policy rotta. Sulle query lato piattaforma NON c'è, e non è una
 * dimenticanza: lì l'assenza di un tenant è il punto.
 */

import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";
import type {
    SupportTicketStatus,
    V2SupportMessage,
    V2SupportTicket
} from "@/types/support";

const TICKETS = "support_tickets";
const MESSAGES = "support_messages";

/**
 * Traduce il rifiuto di RLS in un errore di dominio.
 *
 * PostgREST risponde 403 con `code = "42501"` e un messaggio che nomina la
 * tabella ("new row violates row-level security policy for table ..."):
 * leggibile per uno sviluppatore, inutilizzabile per un utente finale. La
 * copy italiana vive nel frontend, non qui e non nel DB.
 *
 * Ogni altro errore viene rilanciato intatto: nascondere un 23503 o un errore
 * di rete dietro "non autorizzato" renderebbe indiagnosticabili bug che non
 * c'entrano con i permessi.
 */
function throwMappedSupportError(error: PostgrestError): never {
    if (error.code === "42501") throw new Error("SUPPORT_NOT_ALLOWED");
    throw error;
}

/**
 * Id dell'utente corrente, per `author_user_id`.
 *
 * Le WITH CHECK impongono `author_user_id = auth.uid()`: passare l'id del
 * chiamante è ridondante ai fini della sicurezza (la policy rifiuterebbe
 * comunque un uid altrui) ma necessario perché la colonna non ha un DEFAULT.
 */
async function requireCurrentUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    const userId = data.user?.id;
    if (!userId) throw new Error("SUPPORT_NOT_AUTHENTICATED");
    return userId;
}

// ─── LATO CLIENTE ───────────────────────────────────────────────────────────

/**
 * Ticket dell'azienda, dal più recentemente movimentato. Tutti i ticket del
 * tenant, non solo quelli aperti dall'utente corrente: il ticket appartiene
 * all'azienda.
 */
export async function listMyTickets(tenantId: string): Promise<V2SupportTicket[]> {
    const { data, error } = await supabase
        .from(TICKETS)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("last_message_at", { ascending: false });

    if (error) throwMappedSupportError(error);
    return (data ?? []) as V2SupportTicket[];
}

/**
 * Get singolo per id. Nessun `tenantId` nella firma: la funzione serve
 * entrambi i lati, e un platform admin non ha un tenant da passare. RLS
 * decide la visibilità.
 *
 * Throw con `.code = "PGRST116"` se non trovato, stesso shape degli altri
 * `get*` del progetto. Nota che "inesistente" e "esistente ma non tuo" sono
 * indistinguibili — è RLS che li rende tali, e va bene così: la differenza
 * rivelerebbe l'esistenza di ticket altrui.
 */
export async function getTicket(ticketId: string): Promise<V2SupportTicket> {
    const { data, error } = await supabase
        .from(TICKETS)
        .select("*")
        .eq("id", ticketId)
        .maybeSingle();

    if (error) throwMappedSupportError(error);
    if (!data) {
        const notFound = new Error("Richiesta di supporto non trovata");
        (notFound as unknown as { code: string }).code = "PGRST116";
        throw notFound;
    }
    return data as V2SupportTicket;
}

/**
 * Messaggi del thread in ordine cronologico. ASC e non DESC: un thread si
 * legge dall'alto, ed è l'ordine in cui il render li impagina.
 */
export async function listMessages(ticketId: string): Promise<V2SupportMessage[]> {
    const { data, error } = await supabase
        .from(MESSAGES)
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

    if (error) throwMappedSupportError(error);
    return (data ?? []) as V2SupportMessage[];
}

export interface CreateTicketInput {
    subject: string;
    /** Sede a cui la richiesta si riferisce. Omesso = ticket di account. */
    activityId?: string | null;
    firstMessage: string;
}

/**
 * Apre un ticket e il suo primo messaggio.
 *
 * Passa dalla RPC `create_support_ticket` (SECURITY INVOKER) e non da due
 * `.insert()`: PostgREST non ha transazioni fra due chiamate HTTP, quindi due
 * insert sequenziali lascerebbero un ticket senza messaggi se il secondo
 * fallisce — e il cliente, non sapendo se il ticket esiste, riproverebbe.
 * Nel corpo della RPC o passano entrambe le righe o nessuna.
 *
 * `created_by` e `author_user_id` NON sono parametri: li legge la RPC da
 * `auth.uid()`. `status` e i timestamp non sono passabili affatto.
 */
export async function createTicket(
    tenantId: string,
    input: CreateTicketInput
): Promise<V2SupportTicket> {
    const { data, error } = await supabase.rpc("create_support_ticket", {
        p_tenant_id: tenantId,
        p_subject: input.subject,
        // Esplicito e non omesso: il parametro non ha DEFAULT lato SQL (in
        // Postgres i default devono essere trailing, e spostarlo cambierebbe
        // l'ordine posizionale della firma).
        p_activity_id: input.activityId ?? null,
        p_first_message: input.firstMessage
    });

    if (error) throwMappedSupportError(error);
    return data as V2SupportTicket;
}

/**
 * Messaggio del cliente. Se il ticket era `closed` il trigger AFTER INSERT lo
 * riporta a `open` e azzera `closed_at`: qui non c'è nulla da fare, e non
 * bisogna aggiungerlo — il cliente non ha UPDATE sul ticket.
 */
export async function postCustomerMessage(
    ticketId: string,
    body: string
): Promise<V2SupportMessage> {
    const authorUserId = await requireCurrentUserId();

    const { data, error } = await supabase
        .from(MESSAGES)
        .insert({
            ticket_id: ticketId,
            body,
            author_user_id: authorUserId,
            author_kind: "customer"
        })
        .select("*")
        .single();

    if (error) throwMappedSupportError(error);
    return data as V2SupportMessage;
}

// ─── LATO PIATTAFORMA ───────────────────────────────────────────────────────
// Nessun filtro tenant: queste query servono l'area /admin, dove il punto è
// vedere tutti i tenant. La visibilità la concede `is_platform_admin()` nella
// policy SELECT; per un cliente le stesse query restituiscono solo il proprio
// tenant, non un errore.

export interface ListAllTicketsFilters {
    status?: SupportTicketStatus;
}

/**
 * Coda della piattaforma. Ordinamento `last_message_at` ASC — chi aspetta da
 * più tempo in cima, che è l'opposto della vista cliente (DESC, il più
 * recente in cima). Sono due domande diverse: "cosa è successo di recente"
 * contro "chi non ha ancora ricevuto risposta".
 */
export async function listAllTickets(
    filters?: ListAllTicketsFilters
): Promise<V2SupportTicket[]> {
    let query = supabase.from(TICKETS).select("*");

    if (filters?.status) {
        query = query.eq("status", filters.status);
    }

    const { data, error } = await query.order("last_message_at", { ascending: true });

    if (error) throwMappedSupportError(error);
    return (data ?? []) as V2SupportTicket[];
}

/**
 * Risposta della piattaforma. `author_kind: "platform"` è accettato solo se
 * `is_platform_admin()`: la seconda policy INSERT lo lega all'identità, quindi
 * un cliente che chiamasse questa funzione riceverebbe `SUPPORT_NOT_ALLOWED`.
 *
 * A differenza di `postCustomerMessage`, questo NON riapre un ticket chiuso:
 * il trigger agisce solo su `author_kind = 'customer'`. Rispondere per
 * chiudere una conversazione non deve rimetterla in coda.
 */
export async function postPlatformMessage(
    ticketId: string,
    body: string
): Promise<V2SupportMessage> {
    const authorUserId = await requireCurrentUserId();

    const { data, error } = await supabase
        .from(MESSAGES)
        .insert({
            ticket_id: ticketId,
            body,
            author_user_id: authorUserId,
            author_kind: "platform"
        })
        .select("*")
        .single();

    if (error) throwMappedSupportError(error);
    return data as V2SupportMessage;
}

/**
 * Cambio di stato, riservato ai platform admin dalla policy UPDATE.
 *
 * Manda SOLO lo status. `closed_at` è derivato dal trigger BEFORE UPDATE
 * `support_tickets_derive_closed_at` (migration 20260827130000): now() quando
 * il ticket entra in chiusura, NULL quando ne esce, invariato se resta chiuso.
 * Scriverlo da qui non servirebbe — il trigger lo sovrascrive comunque — e
 * reintrodurrebbe un timestamp preso dall'orologio del client.
 *
 * Un chiamante senza i privilegi non riceve un 42501: la `USING` della policy
 * semplicemente non seleziona alcuna riga e l'UPDATE ne tocca zero. Da qui il
 * `SUPPORT_NOT_ALLOWED` sul ramo `!data`, che accorpa "non autorizzato" e
 * "inesistente" — indistinguibili per costruzione, ed è corretto che lo siano.
 */
export async function updateTicketStatus(
    ticketId: string,
    status: SupportTicketStatus
): Promise<V2SupportTicket> {
    const { data, error } = await supabase
        .from(TICKETS)
        .update({ status })
        .eq("id", ticketId)
        .select("*")
        .maybeSingle();

    if (error) throwMappedSupportError(error);
    if (!data) throw new Error("SUPPORT_NOT_ALLOWED");
    return data as V2SupportTicket;
}
