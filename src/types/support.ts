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
}

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
