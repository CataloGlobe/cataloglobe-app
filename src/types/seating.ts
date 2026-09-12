// La tavolata: un gruppo di persone che occupa uno o più tavoli in una
// finestra di tempo. È l'unità operativa di sala, e vive anche dove il locale
// non usa gli ordini da QR — per questo è un'entità propria e non una
// generalizzazione di `order_groups`.
//
// Rapporti con ciò che esiste, da tenere a mente leggendo questi tipi:
//   `reservation_tables` = il PIANO, deciso prima del servizio.
//   `seating_tables`     = il FATTO, i tavoli davvero occupati.
// Le due possono divergere e devono poterlo fare: spostare una tavolata non
// riscrive la proposta del motore.
//
// La tavolata è la SORGENTE DI VERITÀ dell'occupazione; `reservations.status`
// la rispecchia. `seated_at` e `completed_at` sulla prenotazione li scrive il
// ciclo della tavolata (migrations 20260911130000..130400), mai l'operatore
// per conto proprio.

export type SeatingStatus = "open" | "closed";

/**
 * Perché la tavolata è stata chiusa.
 *
 * `operator` = l'host ha premuto "servizio concluso".
 * `auto`     = il sistema ha chiuso a fine giornata ciò che nessuno aveva
 *              chiuso.
 *
 * Sembrano lo stesso fatto e non lo sono: molte chiusure automatiche
 * significano che la vista di sala non viene usata, cioè che i dati di
 * occupazione hanno smesso di descrivere la realtà. È un indicatore, non un
 * dettaglio di implementazione.
 */
export type SeatingClosedReason = "operator" | "auto";

// Seating — riga di public.seatings (migration 20260911100000).
export interface Seating {
    id: string;
    tenant_id: string;
    activity_id: string;
    /**
     * Coperti effettivi al tavolo.
     *
     * NULL significa IGNOTO, non zero: una tavolata nasce spesso prima che si
     * sappia in quanti sono davvero, e obbligare l'host a inventare un numero
     * significa avere un numero inventato nel database. L'interfaccia lo
     * tratta come "non ancora dichiarato", non come un errore da correggere.
     *
     * Per una tavolata aperta da prenotazione parte dai coperti della
     * prenotazione, e da lì può divergere: se ne presentano tre invece di sei,
     * il fatto è tre.
     */
    party_size: number | null;
    status: SeatingStatus;
    opened_at: string;
    /** NULL = aperta. È il solo modo di sapere che il servizio è in corso. */
    closed_at: string | null;
    /**
     * Valorizzato insieme a `closed_at` e NULL finché la tavolata è aperta.
     * NULL su una tavolata chiusa non è previsto: se capita, è un dato
     * scritto fuori dalle RPC.
     */
    closed_reason: SeatingClosedReason | null;
    /**
     * Chi l'ha aperta. NULL = aperta senza un utente autenticato dietro —
     * oggi non succede (le RPC girano solo da dashboard), domani sì quando la
     * aprirà il cliente scansionando un QR. Stesso significato di
     * `reservations.created_by_user_id`.
     */
    opened_by_user_id: string | null;
    /** Note dell'host sulla tavolata. NULL = nessuna nota, non "nessuna". */
    notes: string | null;
    created_at: string;
    updated_at: string;
}

// SeatingTable — riga di public.seating_tables: un tavolo REALMENTE occupato
// da una tavolata (molti-a-molti, tavoli accostati).
//
// Le righe NON vengono cancellate alla chiusura della tavolata: l'occupazione
// si deriva da `seatings.status`, e lo storico di chi sedeva dove va
// conservato. Stessa regola di `reservation_tables`.
export interface SeatingTable {
    id: string;
    tenant_id: string;
    activity_id: string;
    seating_id: string;
    table_id: string;
    /** Quando il tavolo è stato messo su questa tavolata. */
    assigned_at: string;
    created_at: string;
    updated_at: string;
}

// Riga di ponte arricchita con il tavolo a cui punta (embed PostgREST via FK
// composita `seating_tables_table_fkey`). `table` è NULL quando il caller non
// può leggere `tables` sulla sede — caso teorico, tutti i ruoli hanno quel
// permesso — e l'UI lo tratta come etichetta ignota.
//
// `deleted_at` non NULL = tavolo soft-deleted: la ponte conserva lo storico,
// ma per l'operatore quel tavolo non esiste più in sala.
export interface SeatingTableWithTable extends SeatingTable {
    table: {
        label: string;
        deleted_at: string | null;
        zone_name: string | null;
    } | null;
}

// SeatingReservation — riga di public.seating_reservations: da quale
// prenotazione nasce una tavolata.
//
// Molti-a-molti di proposito: due prenotazioni distinte possono formare una
// sola tavolata (due coppie che si conoscono, un tavolone). L'ASSENZA di righe
// è il walk-in — chi entra senza aver prenotato — ed è un caso frequente, non
// di bordo.
export interface SeatingReservation {
    id: string;
    tenant_id: string;
    activity_id: string;
    seating_id: string;
    reservation_id: string;
    created_at: string;
}
