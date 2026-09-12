// Quale tavolo mostra la sezione TAVOLO del drawer, e dove scrive chi lo
// cambia.
//
// ── Il punto ─────────────────────────────────────────────────────────────
// Due tabelle rispondono a due domande diverse:
//   `reservation_tables` = il PIANO, la proposta fatta prima del servizio.
//   `seating_tables`     = il FATTO, i tavoli davvero occupati adesso.
// Prima del servizio si guarda e si cambia il piano. Dal momento in cui sono
// seduti, si guarda e si cambia il fatto. Un "Cambia tavolo" che su una
// prenotazione seduta riscrive il piano sposta una proposta che non governa
// più niente e lascia i tavoli reali dove erano: due verità invece di una.
//
// ── L'invariante ─────────────────────────────────────────────────────────
// Il fatto esiste se e solo se lo stato è `seated` o `completed`. Non è una
// probabilità, è una proprietà delle transizioni: `mark_no_show` parte solo da
// `confirmed` ed è bloccato su `seated`, `cancel` solo da `confirmed`,
// `decline` solo da `pending`, e `undo_seating` CANCELLA la tavolata riportando
// la prenotazione a `confirmed`. Perciò `declined` / `cancelled` / `no_show`
// non hanno e non possono avere una tavolata: leggono il piano, al passato.
//
// Logica pura e fuori dal JSX apposta: è una regola, e una regola si testa.
// Stesso criterio di `seatingActions.ts` e `reminderStatus.ts`.

import type { ReservationStatus } from "@/types/reservation";

/** Da quale delle due tabelle si leggono i tavoli mostrati. */
export type TableSectionSource = "plan" | "seating";

/** Dove scrive "Cambia tavolo". */
export type TableSectionTarget = "plan" | "seating";

/**
 * Quale frase va sotto l'elenco. È la sola cosa che cambia fra le forme:
 * l'etichetta della sezione resta "Tavolo"/"Tavoli" in tutti i casi.
 *
 * `plan_live`  → piano vivo. La frase compare SOLO se la proposta è ancora del
 *                sistema (`TableAssignmentView.proposed`): una decisione
 *                dell'operatore non si annuncia.
 * `plan_past`  → piano di una prenotazione che non si è mai seduta. La frase
 *                compare SEMPRE: senza, un elenco di tavoli su una
 *                prenotazione annullata si legge come un fatto.
 * `seated`     → fatto, in corso.
 * `closed`     → fatto, servizio concluso.
 * `fact_loading` → il fatto è la fonte ma non è ancora arrivato.
 * `fact_missing` → il fatto è la fonte e non esiste: divergenza col DB, non un
 *                esito normale (vedi l'invariante sopra).
 */
export type TableSectionNote =
    | "plan_live"
    | "plan_past"
    | "seated"
    | "closed"
    | "fact_loading"
    | "fact_missing";

export interface TableSectionInput {
    status: ReservationStatus;
    /**
     * La tavolata collegata alla prenotazione.
     *   `undefined` = non ancora caricata (o non richiesta: sugli stati di
     *                 piano non viene nemmeno cercata e resta così).
     *   `null`      = cercata e non trovata.
     * Rilevante solo quando la fonte è il fatto.
     */
    seatingId?: string | null;
    /** `canDoOnActivity(perms, 'reservations.manage', activityId)` — il piano. */
    canManage: boolean;
    /** `canDoOnActivity(perms, 'seatings.manage', activityId)` — il fatto. */
    canManageSeatings: boolean;
}

export interface TableSectionShape {
    source: TableSectionSource;
    /** `null` = sola lettura: nessun gesto, per permessi o per stato. */
    target: TableSectionTarget | null;
    note: TableSectionNote;
}

/**
 * Le quattro forme della sezione.
 *
 * | stato                          | fonte  | gesto |
 * |--------------------------------|--------|-------|
 * | `pending`, `confirmed`         | piano  | scrive nel piano    |
 * | `seated`                       | fatto  | scrive nella tavolata |
 * | `completed`                    | fatto  | nessuno |
 * | `declined`, `cancelled`, `no_show` | piano | nessuno |
 *
 * Quando la fonte è il fatto ma la tavolata non c'è (non ancora caricata, o
 * non trovata) il gesto sparisce: non si ripiega MAI sul piano. Scrivere nel
 * posto sbagliato perché quello giusto non risponde è il modo di produrre le
 * due verità che questo modello esiste per evitare.
 */
export function tableSectionFor({
    status,
    seatingId,
    canManage,
    canManageSeatings
}: TableSectionInput): TableSectionShape {
    if (status === "pending" || status === "confirmed") {
        return {
            source: "plan",
            target: canManage ? "plan" : null,
            note: "plan_live"
        };
    }

    if (status === "seated" || status === "completed") {
        const note: TableSectionNote =
            seatingId === undefined
                ? "fact_loading"
                : seatingId === null
                  ? "fact_missing"
                  : status === "seated"
                    ? "seated"
                    : "closed";
        // `completed` è terminale: il fatto si guarda, non si cambia.
        const editable = status === "seated" && canManageSeatings && typeof seatingId === "string";
        return {
            source: "seating",
            target: editable ? "seating" : null,
            note
        };
    }

    // `declined` | `cancelled` | `no_show`: il piano, al passato.
    return { source: "plan", target: null, note: "plan_past" };
}

/**
 * Dove deve scrivere il gesto "Cambia tavolo", per chi lo esegue (la pagina)
 * e non per chi lo disegna (il drawer). Stessa regola, stessa funzione: il
 * bottone e la scrittura non possono divergere.
 */
export function tableWriteTargetFor(input: TableSectionInput): TableSectionTarget | null {
    return tableSectionFor(input).target;
}
