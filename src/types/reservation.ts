// V2Reservation — riga di public.reservations. Una prenotazione tavolo
// associata a una sede (activity_id), inserita dal flusso customer-facing
// e gestita dall'admin via transizioni di status (pending → confirmed |
// declined | cancelled).
//
// `reservation_date` e' DATE Postgres serializzato come stringa "YYYY-MM-DD".
// `reservation_time` e' TIME senza timezone, serializzato come "HH:MM:SS"
// (wall-clock locale della sede; nessuna aritmetica timezone DB-side).
// `no_show` = il cliente non si è presentato. Raggiungibile solo da
// `confirmed` ed è reversibile: il dato alimenterà un indice di affidabilità,
// quindi una marcatura sbagliata deve essere correggibile.
// `seated` e `completed` li scrive il ciclo della tavolata (BLOCCO 2:
// `open_seating_for_reservation` al gesto «Arrivato», `close_seating` /
// `close_stale_seatings` alla chiusura), non l'endpoint admin delle
// transizioni. `seated` OCCUPA: un tavolo, e anche la capienza — la comitiva
// è in sala, i suoi coperti contano finché non è `completed`. Ogni filtro che
// distingue «attiva» da «chiusa» deve includerlo, lato SQL
// (`reservation_peak_with_candidate`, `reservation_pacing_block`) come lato
// frontend (`occupiesCapacity` in src/utils/reservationCapacity.ts). Il bug
// della FASE 5.1 è nato da una versione di questo commento che diceva «oggi
// nessuno li scrive».
export type ReservationStatus =
    | "pending"
    | "confirmed"
    | "seated"
    | "completed"
    | "declined"
    | "cancelled"
    | "no_show";

// "online" = submitted via the public form (submit-reservation edge function);
// "manual" = inserted by an admin via the dashboard (createReservation).
export type ReservationSource = "online" | "manual";

export interface V2Reservation {
    id: string;
    tenant_id: string;
    activity_id: string;
    reservation_date: string;
    reservation_time: string;
    party_size: number;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    // Forma canonica E.164 del telefono (`+393451559558`), calcolata a write
    // time da `normalizePhoneToE164`. NULL quando il grezzo non è
    // interpretabile e su tutte le righe precedenti alla migration
    // 20260827100000 (nessun backfill). Presentazione e `tel:` continuano a
    // usare `customer_phone`: questa colonna è una chiave, non un'etichetta.
    customer_phone_e164: string | null;
    notes: string | null;
    /**
     * Profilo ospite agganciato dal trigger `reservations_link_guest`
     * (migration 20260902120002). NULL quando `customer_phone_e164` è NULL:
     * un numero che non sappiamo canonicalizzare non è un'identità, e la
     * prenotazione resta valida senza profilo.
     */
    guest_id: string | null;
    /**
     * Codice lingua (ISO 639-1, minuscolo) in cui il cliente stava leggendo la
     * pagina pubblica quando ha inviato la prenotazione. Determina la lingua
     * delle email al cliente e delle stringhe dell'allegato .ics; le email alla
     * sede restano italiane sempre.
     *
     * NULL significa LINGUA IGNOTA, non "italiano": inserimento manuale
     * dall'admin (il ristoratore non sa in che lingua pensa il cliente) o riga
     * anteriore alla migration 20260831120000. Il fallback a italiano è
     * applicato da chi compone l'email, così il dato resta onesto.
     *
     * Può contenere una lingua che le email non sanno rendere (es. 'pt'): la
     * colonna registra la scelta del cliente, non la copertura delle nostre
     * traduzioni.
     */
    customer_language: string | null;
    status: ReservationStatus;
    source: ReservationSource;
    // Stamped by DB DEFAULT auth.uid() on INSERT (migration
    // 20260609100000). Resolves to the operator's user id for `source =
    // "manual"` inserts and to NULL for online inserts (RPC runs as
    // service_role). Read-only from the frontend perspective.
    created_by_user_id: string | null;
    /**
     * Quando l'ospite si è seduto. Colonna esistente dal 15 giugno (migration
     * 20260615140000) e rimasta senza scrittore fino alla tavolata.
     *
     * NULL = non si è (ancora) seduto. Su una prenotazione passata vuol dire
     * che nessuno ha registrato l'arrivo: può essere un no-show, ma molto più
     * spesso è un locale che non usa la vista di sala. NON leggerlo come
     * "non è venuto".
     *
     * SCRITTO SOLO dal ciclo della tavolata: `open_seating_for_reservation` lo
     * valorizza, `undo_seating` lo riazzera (migrations 20260911130000 /
     * 130400). Mai dall'operatore direttamente — la tavolata è la sorgente di
     * verità dell'occupazione e questa colonna la rispecchia, e due scrittori
     * per lo stesso fatto sono il modo in cui i due stati iniziano a
     * contraddirsi.
     */
    seated_at: string | null;
    /**
     * Quando il servizio a quel tavolo è finito. Insieme a `seated_at` dà il
     * tempo di permanenza, che è la ragione per cui le due colonne furono
     * create.
     *
     * NULL = servizio non concluso, il che comprende sia "sono ancora seduti"
     * sia "non si sono mai seduti": è `seated_at` a distinguere i due casi.
     *
     * SCRITTO SOLO da `close_seating` (migration 20260911130300), e solo sulle
     * prenotazioni che erano davvero in `seated`.
     */
    completed_at: string | null;
    /**
     * Quando è partito il promemoria della sera prima. NULL = non ancora
     * inviato. Scritto solo dall'Edge `send-reservation-reminders`, che lo usa
     * come lucchetto contro il doppio invio (migration 20260829120000).
     */
    reminder_sent_at: string | null;
    /**
     * Quante volte si è tentato di inviare il promemoria, riusciti e falliti.
     *
     * 0 significa MAI TENTATO. Su una prenotazione passata vuol dire che non è
     * mai stata un candidato: non confermata all'ora del giro, sede con il
     * promemoria spento, oppure tenant fuori abbonamento. Non è un errore da
     * mostrare.
     *
     * Non si azzera mai: è un contatore, non uno stato.
     */
    reminder_attempts: number;
    /**
     * Quando è fallito l'ULTIMO tentativo (migration 20260911110000).
     *
     * NULL non significa "riuscito": significa MAI FALLITO. Va sempre letto
     * insieme a `reminder_sent_at`, perché è la coppia a dire cosa è successo:
     *   - sent pieno, failed NULL   → inviato;
     *   - sent pieno, failed pieno  → rivendicato ma non consegnato (il claim è
     *     passato, l'email no). È una perdita, e va detta in chiaro;
     *   - sent NULL, failed pieno   → non inviato, con il motivo;
     *   - entrambi NULL             → in attesa, oppure non previsto.
     */
    reminder_failed_at: string | null;
    /**
     * Motivo in chiaro dell'ULTIMO fallimento (es. `claim: Gateway Timeout`).
     *
     * Sovrascritto a ogni nuovo tentativo fallito: è l'ultimo stato, non uno
     * storico. NULL = nessun fallimento registrato. Scritto solo dall'Edge, che
     * redige il messaggio prima di salvarlo.
     */
    reminder_last_error: string | null;
    /**
     * Quando il cliente ha confermato la presenza dal link nel promemoria.
     *
     * NULL significa SILENZIO, non "non viene": la maggior parte dei clienti
     * non premerà nulla, e l'interfaccia deve trattarlo come normale. Un
     * indicatore di allarme sui NULL riempirebbe la sera di venti allarmi per
     * il comportamento più comune che esista.
     *
     * Azzerato dal trigger `reservations_reset_reminder_on_reschedule` quando
     * la prenotazione viene spostata: una conferma vale per l'orario che il
     * cliente ha visto, non per un altro.
     */
    guest_confirmed_at: string | null;
    created_at: string;
    updated_at: string;
}

// Chi ha scelto il tavolo (public.reservation_tables.assignment_source).
// "system" = proposta del motore automatico (assign_tables_for_reservation),
//            ricalcolabile: il motore la cancella e la rifà.
// "manual" = decisione dell'operatore, intoccabile: basta UNA riga manual
//            sulla prenotazione perché l'intera assegnazione sia fissa.
export type ReservationTableAssignmentSource = "system" | "manual";

// ReservationTableAssignment — riga di public.reservation_tables: un tavolo
// assegnato a una prenotazione (molti-a-molti, tavoli accostati).
// Le righe NON vengono cancellate al cambio di status della prenotazione:
// l'occupazione si deriva sempre via join su reservations.status
// (pending | confirmed | seated occupano). Una disdetta annullata ritrova i
// suoi tavoli senza riassegnazione.
export interface ReservationTableAssignment {
    id: string;
    tenant_id: string;
    activity_id: string;
    reservation_id: string;
    table_id: string;
    assignment_source: ReservationTableAssignmentSource;
    /** Quando la riga è stata scritta dall'assegnatario (motore o operatore). */
    assigned_at: string;
    created_at: string;
    updated_at: string;
}

// Riga di ponte arricchita con il tavolo a cui punta (embed PostgREST via FK
// composita `reservation_tables_table_fkey`). `table` è NULL quando il caller
// non può leggere `tables` sulla sede (RLS `tables.read`) — caso teorico,
// tutti i ruoli hanno quel permesso — e l'UI lo tratta come etichetta ignota.
// `deleted_at` non NULL = tavolo soft-deleted: la ponte conserva lo storico,
// ma per l'operatore è un conflitto (il tavolo non esiste più in sala).
export interface ReservationTableAssignmentWithTable extends ReservationTableAssignment {
    table: {
        label: string;
        deleted_at: string | null;
        zone_name: string | null;
    } | null;
}

// Esito del motore assign_tables_for_reservation, così come lo restituiscono
// anche reset_reservation_tables_to_system e la RPC di riorganizzazione.
// Una riga per tavolo assegnato (assigned=true), oppure UNA sola riga
// (table_id=null, assigned=false) con il motivo.
export type ReservationTableAssignmentReason =
    | "single"
    | "single_relaxed_min"
    | "combination"
    | "no_table_available"
    | "manual_assignment"
    | "inactive_status"
    | "reservation_not_found";

export interface ReservationTableAssignmentOutcome {
    table_id: string | null;
    assigned: boolean;
    reason: ReservationTableAssignmentReason;
}

// Riepilogo di reassign_activity_tables(sede, data).
export interface ReassignActivityTablesSummary {
    /** Prenotazioni con almeno un tavolo dopo il giro. */
    reassigned: number;
    /** Prenotazioni rimaste senza tavolo dopo il giro. */
    unassigned: number;
    /** Prenotazioni attive saltate perché hanno un'assegnazione manual. */
    skipped_manual: number;
}
