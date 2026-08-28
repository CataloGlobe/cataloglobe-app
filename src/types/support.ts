// Tipi del dominio supporto — righe di `public.support_tickets` e
// `public.support_messages` (migration 20260827100000).
//
// Il ticket appartiene all'AZIENDA, non a chi lo apre: `created_by` è
// attribuzione e non compare in nessuna policy di lettura. Ogni membro del
// tenant con `support.read` vede anche i ticket dei colleghi.
//
// Convenzione di progetto: file di tipi per dominio in `src/types/` con nome
// singolare (`reservation.ts`), interfacce riga con prefisso `V2`.

/**
 * Valori DB in inglese, UI in italiano (Aperta / In lavorazione / Chiusa) —
 * stessa convenzione di `activities.status` e `orders.status`.
 *
 * Solo un platform admin può cambiare stato: la policy UPDATE su
 * `support_tickets` è `is_platform_admin()` e basta. Il cliente non ha alcun
 * percorso di UPDATE — la riapertura su suo messaggio passa dal trigger
 * `support_messages_touch_ticket`.
 */
export type SupportTicketStatus = "open" | "in_progress" | "closed";

/**
 * Da quale lato arriva il messaggio. NON è impostabile dal client: lo fissano
 * le due policy INSERT disgiunte su `support_messages`. Senza quel vincolo un
 * utente qualsiasi potrebbe firmarsi "supporto CataloGlobe" dentro il thread
 * della propria azienda.
 */
export type SupportAuthorKind = "customer" | "platform";

export interface V2SupportTicket {
    id: string;
    tenant_id: string;
    /** Sede a cui la richiesta si riferisce. NULL = ticket di account. */
    activity_id: string | null;
    subject: string;
    status: SupportTicketStatus;
    /**
     * Chi ha aperto il ticket. Attribuzione, non ownership. NULL se l'utente
     * è stato cancellato (FK ON DELETE SET NULL).
     */
    created_by: string | null;
    /** Timbrato dal trigger BEFORE INSERT: il valore inviato è scartato. */
    created_at: string;
    updated_at: string;
    /**
     * Denormalizzato: riscritto dal trigger AFTER INSERT su ogni messaggio.
     * È la chiave di ordinamento della coda admin ("chi aspetta da più
     * tempo"), non un dato decorativo.
     */
    last_message_at: string;
    /**
     * Derivato interamente da `status` dal trigger BEFORE UPDATE
     * `support_tickets_derive_closed_at`: mai scritto dal client. Invariante
     * garantita a DB: `closed_at IS NOT NULL` ⟺ `status === "closed"`.
     */
    closed_at: string | null;
    /**
     * Ultima apertura del thread dal lato cliente. NULL = mai letto — è lo
     * stato di ogni ticket appena aperto e di tutti quelli precedenti alla
     * migration 20260827140000, che di proposito non ha un default.
     *
     * Scritta solo dalla RPC `mark_support_ticket_read`: sul ticket il cliente
     * non ha UPDATE, e questo commit non ha allentato quella policy.
     */
    customer_last_read_at: string | null;
    /**
     * `author_kind` dell'ultimo messaggio, denormalizzato dal trigger
     * `support_touch_ticket_on_message` insieme a `last_message_at`.
     *
     * Esiste perché il solo confronto fra timestamp segnalerebbe come "non
     * letto" anche il messaggio appena scritto dal cliente stesso. NULL solo
     * per un ticket senza messaggi (non producibile da `createTicket`).
     */
    last_message_kind: SupportAuthorKind | null;
}

/**
 * Contesto del ticket risolto via embed PostgREST (`tenants(name)` /
 * `activities(name)`), non colonne della riga.
 *
 * Serve alla coda `/admin/supporto`: chi risponde ha bisogno di sapere QUALE
 * azienda scrive, e quel dato non è sul ticket. Sbloccato dalle due policy
 * SELECT per platform admin della migration 20260828130000 — prima l'embed
 * tornava `null` in silenzio.
 *
 * Entrambi i campi restano opzionali e nullable perché l'embed è un
 * `LEFT JOIN` filtrato da RLS: `null` significa "sede non indicata" oppure
 * "riga non leggibile da chi sta chiedendo", e la UI non può distinguerli.
 */
export interface SupportTicketContext {
    tenants?: { name: string } | null;
    activities?: { name: string } | null;
}

/** Ticket con il contesto già risolto. */
export type V2SupportTicketWithContext = V2SupportTicket & SupportTicketContext;

export interface V2SupportMessage {
    id: string;
    ticket_id: string;
    body: string;
    /** NULL se l'autore è stato cancellato (FK ON DELETE SET NULL). */
    author_user_id: string | null;
    author_kind: SupportAuthorKind;
    /** Timbrato dal trigger BEFORE INSERT: non retrodatabile dal client. */
    created_at: string;
}
