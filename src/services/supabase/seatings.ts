// Ciclo di vita della tavolata: le cinque scritture e le due letture che
// servono al drawer della prenotazione.
//
// Le cinque RPC (migrations 20260911130000..130400) sono SECURITY DEFINER con
// gate interno `has_permission('seatings.manage', activity_id)` → 42501 unico
// per "non esiste" e "non autorizzato". Il frontend non deve mai dedurre
// l'esistenza di una riga dall'errore che riceve.
//
// Mapping errori come la sezione "Assegnazione tavoli" di `reservations.ts`,
// da cui questo file prende la forma delle firme: `tenantId` viaggia sempre
// nella firma anche quando la RPC non ne ha bisogno (tenant e sede vengono
// dalla riga lato server), sia per uniformità sia per il filtro difensivo sui
// risultati.

import { supabase } from "./client";
import type {
    Seating,
    SeatingTable,
    SeatingTableWithTable
} from "@/types/seating";

/**
 * Mappa gli errori delle RPC della tavolata in Error con `.code` per il
 * branching UI. 42501 e 22023 hanno un messaggio italiano; il resto passa.
 *
 * 22023 tiene il messaggio DEL SERVER e non una frase generica: le RPC lo
 * usano per dire cose diverse fra loro ("va confermata prima", "la tavolata è
 * chiusa", "ha dei conti collegati"), e sostituirle tutte con "Richiesta non
 * valida" toglierebbe all'operatore l'unica informazione utile.
 */
function mapSeatingRpcError(error: { code?: string; message?: string }): Error {
    let message: string;
    if (error.code === "42501") {
        message = "Operazione non autorizzata";
    } else if (error.code === "22023") {
        message = error.message ?? "Richiesta non valida";
    } else {
        message = error.message ?? "Errore inatteso";
    }
    const err = new Error(message);
    (err as Error & { code?: string; details?: string }).code = error.code;
    (err as Error & { code?: string; details?: string }).details = error.message;
    return err;
}

// ─────────────────────────────────────────────────────────────────────────────
// Letture
// ─────────────────────────────────────────────────────────────────────────────

// Embed della ponte per filtrare sulla prenotazione restando su `seatings`:
// i filtri che contano (`status`, `tenant_id`) sono così colonne di primo
// livello, non filtri su risorsa annidata.
const SEATING_BY_RESERVATION_SELECT =
    "*, seating_reservations!seating_reservations_seating_fkey!inner(reservation_id)";

/**
 * La tavolata APERTA collegata a una prenotazione, o `null`.
 *
 * `null` non è un errore ed è anzi il caso normale: la stragrande maggioranza
 * delle prenotazioni non ha nessuno seduto. Lanciare qui costringerebbe ogni
 * apertura di drawer a un try/catch per un esito previsto.
 *
 * Solo le aperte: una tavolata chiusa è un servizio concluso, e per il drawer
 * conta solo se c'è gente al tavolo ADESSO. `limit(1)` sull'apertura più
 * vecchia — due tavolate aperte per la stessa prenotazione sono un dato rotto
 * che le RPC impediscono, ma se ci fosse si mostrerebbe la prima, non una a
 * caso.
 */
export async function getSeatingForReservation(
    reservationId: string,
    tenantId: string
): Promise<Seating | null> {
    const { data, error } = await supabase
        .from("seatings")
        .select(SEATING_BY_RESERVATION_SELECT)
        .eq("seating_reservations.reservation_id", reservationId)
        .eq("tenant_id", tenantId)
        .eq("status", "open")
        .order("opened_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    // L'embed serviva solo a filtrare: fuori dal tipo di ritorno.
    const seating = { ...(data as Record<string, unknown>) };
    delete seating.seating_reservations;
    return seating as unknown as Seating;
}

// Embed del tavolo via FK composita (table_id, activity_id). Il nome del
// vincolo disambigua fra `tables` e la view `v_tables_with_state`, che
// PostgREST vede come due bersagli della stessa FK. Si legge da `tables`
// SENZA filtrare `deleted_at`: una ponte può puntare a un tavolo rimosso e
// l'UI deve poterlo dire, non nasconderlo. Stesso schema di
// `reservations.ts:RESERVATION_TABLES_WITH_TABLE_SELECT`.
const SEATING_TABLES_WITH_TABLE_SELECT =
    "*, table:tables!seating_tables_table_fkey(label, deleted_at, zone:table_zones!tables_zone_id_fkey(name))";

// supabase-js tipizza un embed 1:1 come oggetto o array a seconda del JOIN.
type JoinedZone = { name: string } | { name: string }[] | null;
type JoinedTable =
    | { label: string; deleted_at: string | null; zone: JoinedZone }
    | { label: string; deleted_at: string | null; zone: JoinedZone }[]
    | null;

function mapJoinedSeatingTable(
    row: Record<string, unknown> & { table?: JoinedTable }
): SeatingTableWithTable {
    const { table, ...rest } = row;
    const t = Array.isArray(table) ? table[0] : table;
    const zone = t ? (Array.isArray(t.zone) ? t.zone[0] : t.zone) : null;
    return {
        ...(rest as unknown as SeatingTable),
        table: t
            ? { label: t.label, deleted_at: t.deleted_at, zone_name: zone?.name ?? null }
            : null
    };
}

/**
 * I tavoli realmente occupati da una tavolata, con l'etichetta embeddata.
 *
 * Array vuoto è un esito normale: una tavolata può nascere senza tavoli (il
 * motore non ha trovato niente, oppure è una sede che non mappa la sala) e
 * restarci.
 *
 * Ordine per `table_id`: stabile, senza significato operativo. L'ordine
 * sensato — per etichetta — lo decide chi presenta, con l'etichetta in mano.
 */
export async function listSeatingTables(
    seatingId: string,
    tenantId: string
): Promise<SeatingTableWithTable[]> {
    const { data, error } = await supabase
        .from("seating_tables")
        .select(SEATING_TABLES_WITH_TABLE_SELECT)
        .eq("seating_id", seatingId)
        .eq("tenant_id", tenantId)
        .order("table_id", { ascending: true });

    if (error) throw error;
    return ((data ?? []) as unknown as Array<Record<string, unknown> & { table?: JoinedTable }>).map(
        mapJoinedSeatingTable
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scritture
// ─────────────────────────────────────────────────────────────────────────────

/**
 * L'ospite è arrivato: apre la tavolata dalla prenotazione, eredita i tavoli
 * pianificati e porta la prenotazione a `seated`.
 *
 * Idempotente lato server: premere due volte restituisce la stessa tavolata
 * invece di aprirne una seconda.
 *
 * Errori (`.code`):
 *   42501 → prenotazione inesistente o non autorizzata
 *   22023 → non è `confirmed`, oppure ha cambiato stato durante l'operazione
 */
export async function openSeatingForReservation(
    reservationId: string,
    // Firma uniforme del service; tenant e sede vengono dalla riga lato server.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _tenantId: string
): Promise<Seating> {
    const { data, error } = await supabase.rpc("open_seating_for_reservation", {
        p_reservation_id: reservationId
    });

    if (error) throw mapSeatingRpcError(error);
    return data as Seating;
}

/**
 * Arriva gente senza prenotazione. Tavoli e coperti sono entrambi facoltativi:
 * chi è in piedi davanti al bancone si siede comunque, e il software o lo
 * registra o viene aggirato.
 *
 * `tableIds` vuoto = nessun tavolo, il che è uno stato legittimo.
 * `partySize` NULL = ancora ignoto, che è diverso da zero.
 *
 * Errori (`.code`):
 *   42501 → sede non autorizzata, o tavolo non di questa sede
 *   22023 → coperti non positivi, elementi null o duplicati nei tavoli
 */
export async function openWalkinSeating(
    activityId: string,
    tableIds: string[],
    partySize: number | null,
    // Firma uniforme del service; il tenant viene dalla sede lato server.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _tenantId: string
): Promise<Seating> {
    const { data, error } = await supabase.rpc("open_walkin_seating", {
        p_activity_id: activityId,
        p_table_ids: tableIds,
        p_party_size: partySize
    });

    if (error) throw mapSeatingRpcError(error);
    return data as Seating;
}

/**
 * Sostituisce i tavoli occupati. Serve sia ad assegnarli la prima volta sia a
 * spostare la tavolata durante il servizio: è la stessa domanda, "dove sono
 * seduti ORA", che ha una sola risposta per volta.
 *
 * Array vuoto ammesso (a differenza di `setReservationTables`): una tavolata
 * senza tavoli è uno stato legittimo, ed è come nasce un walk-in.
 *
 * Errori (`.code`):
 *   42501 → tavolata non autorizzata, o tavolo non di questa sede
 *   22023 → tavolata non aperta, elementi null o duplicati
 */
export async function setSeatingTables(
    seatingId: string,
    tableIds: string[],
    tenantId: string
): Promise<SeatingTable[]> {
    const { data, error } = await supabase.rpc("set_seating_tables", {
        p_seating_id: seatingId,
        p_table_ids: tableIds
    });

    if (error) throw mapSeatingRpcError(error);
    const rows = (data ?? []) as SeatingTable[];
    return rows.filter(r => r.tenant_id === tenantId);
}

/**
 * Il servizio è finito: chiude la tavolata e porta a `completed` le
 * prenotazioni che ci sedevano. Le righe dei tavoli restano — l'occupazione si
 * deriva dallo stato, e lo storico di chi sedeva dove va conservato.
 *
 * Idempotente lato server: richiudere non sposta `closed_at`.
 *
 * `reason` distingue il gesto dell'operatore dalla chiusura automatica di fine
 * giornata. Dalla dashboard è sempre `'operator'`: `'auto'` appartiene al job
 * che oggi non esiste.
 *
 * Errori (`.code`): 42501 (non autorizzata), 22023 (motivo non ammesso).
 */
export async function closeSeating(
    seatingId: string,
    reason: "operator" | "auto",
    // Firma uniforme del service; tenant e sede vengono dalla riga lato server.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _tenantId: string
): Promise<Seating> {
    const { data, error } = await supabase.rpc("close_seating", {
        p_seating_id: seatingId,
        p_reason: reason
    });

    if (error) throw mapSeatingRpcError(error);
    return data as Seating;
}

/**
 * "Ho premuto sul nome sbagliato": cancella la tavolata e riporta le
 * prenotazioni collegate da `seated` a `confirmed`.
 *
 * NON è `closeSeating`. La differenza è fra "non è successo" e "è finito":
 * qui si cancella perché un errore di battitura non è un fatto di sala, e
 * lasciarlo nei dati avvelena ogni statistica di permanenza al tavolo con
 * sedute di trenta secondi. I due gesti non vanno mai avvicinati
 * nell'interfaccia fino a sembrare varianti l'uno dell'altro.
 *
 * Errori (`.code`): 42501 (non autorizzata), 22023 (tavolata chiusa, o con
 * conti collegati).
 */
export async function undoSeating(
    seatingId: string,
    // Firma uniforme del service; tenant e sede vengono dalla riga lato server.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _tenantId: string
): Promise<void> {
    const { error } = await supabase.rpc("undo_seating", {
        p_seating_id: seatingId
    });

    if (error) throw mapSeatingRpcError(error);
}
