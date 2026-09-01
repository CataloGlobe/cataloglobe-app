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
// Il CHECK del DB ammette anche `seated` e `completed` (migration
// 20260615140000): restano fuori finché non esiste chi li scrive.
export type ReservationStatus =
    | "pending"
    | "confirmed"
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
     * Quando è partito il promemoria della sera prima. NULL = non ancora
     * inviato. Scritto solo dall'Edge `send-reservation-reminders`, che lo usa
     * come lucchetto contro il doppio invio (migration 20260829120000).
     */
    reminder_sent_at: string | null;
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
