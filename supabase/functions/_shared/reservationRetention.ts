// =============================================================================
// reservationRetention — logica pura della cancellazione a 24 mesi
// =============================================================================
//
// Estratta da purge-reservation-data/index.ts sul modello di
// `_shared/translation/processTranslationTick.ts`: NESSUN global Deno qui e
// nessun import con estensione `.ts`, così il modulo è importabile da Vitest
// (node) senza rompere `tsc --noEmit` dell'app.
//
// Cosa fa il tick, e in quale ordine (l'ordine NON è invertibile — vedi sotto):
//
//   1. SELEZIONE   — raccoglie gli id dei profili la cui ultima prenotazione è
//                    oltre la soglia, e degli "orfani" (prenotazioni senza
//                    profilo) oltre la stessa soglia.
//   2. ANONIMIZZA  — svuota i campi personali delle prenotazioni.
//   3. CANCELLA    — elimina i profili raccolti al passo 1.
//
// PERCHÉ QUEST'ORDINE E PERCHÉ NON SI PUÒ INVERTIRE — due ragioni distinte.
//
//   a) La lista va raccolta PRIMA e tenuta in memoria per tutto il tick.
//      L'anonimizzazione azzera `reservations.guest_id`: dopo di essa non
//      esiste più alcun legame fra prenotazione e profilo, e rileggere la lista
//      a quel punto non restituirebbe più nulla da cancellare. Resterebbero
//      profili con dentro nome, telefono, email e note del locale — cioè
//      esattamente i dati che il job esiste per rimuovere.
//
//   b) La cancellazione va DOPO l'anonimizzazione, mai prima. Un UPDATE che
//      arrivi su un profilo già cancellato fa scattare il trigger
//      `reservations_link_guest`, che lo REINSERISCE dal numero di telefono
//      della prenotazione. Vedi il commento su ANONYMIZATION_PATCH in
//      purge-reservation-data/index.ts e i test corrispondenti.
//
// Il ramo "orfano" (prenotazioni con `guest_id` NULL, perché il telefono non
// era normalizzabile) NON è un caso residuo: sui dati reali è frequente quanto
// l'altro, e riceve lo stesso trattamento e gli stessi test.
// =============================================================================

/**
 * Valore convenzionale scritto sulle colonne NOT NULL di `reservations`
 * (`customer_name`, `customer_email`, `customer_phone`).
 *
 * ⚠️ SYNC: lo stesso letterale vive nella migration dei selettori
 * (`list_expired_orphan_reservations` lo usa per NON rileggere righe già
 * anonimizzate: è ciò che rende il job idempotente). Cambiarlo qui senza
 * cambiarlo là fa rientrare ogni riga già trattata in ogni esecuzione.
 *
 * Non stringa vuota (indistinguibile da un bug di scrittura) e non un
 * indirizzo sintatticamente valido (sembrerebbe un dato vero e finirebbe in un
 * mailto): deve essere leggibile in italiano da chi apre lo storico senza
 * sapere che questo job esiste.
 */
export const ANONYMIZED_PLACEHOLDER = "[dato rimosso]";

// ── Contratto store ─────────────────────────────────────────────────────────

export interface RetentionDbError {
    message: string;
}

export interface RetentionResult<T> {
    data: T | null;
    error: RetentionDbError | null;
}

export interface ExpiredGuest {
    guest_id: string;
    tenant_id: string;
}

export interface ExpiredOrphanReservation {
    reservation_id: string;
    tenant_id: string;
}

export interface RetentionStore {
    /** Profili la cui ultima prenotazione è anteriore alla soglia. */
    listExpiredGuests(
        cutoffDate: string,
        limit: number
    ): Promise<RetentionResult<ExpiredGuest[]>>;

    /** Prenotazioni senza profilo, anteriori alla soglia, non già anonimizzate. */
    listExpiredOrphanReservations(
        cutoffDate: string,
        limit: number
    ): Promise<RetentionResult<ExpiredOrphanReservation[]>>;

    /**
     * UN SOLO statement di UPDATE su tutte le prenotazioni dei profili passati.
     * Ritorna il numero di righe toccate.
     */
    anonymizeReservationsOfGuests(
        tenantId: string,
        guestIds: readonly string[]
    ): Promise<RetentionResult<number>>;

    /** Come sopra, ma per id di prenotazione (ramo orfano). */
    anonymizeReservationsById(
        tenantId: string,
        reservationIds: readonly string[]
    ): Promise<RetentionResult<number>>;

    /** Cancellazione dei profili. Da chiamare SOLO dopo l'anonimizzazione. */
    deleteGuests(
        tenantId: string,
        guestIds: readonly string[]
    ): Promise<RetentionResult<number>>;
}

// ── Deps + summary ──────────────────────────────────────────────────────────

export interface RetentionTickDeps {
    store: RetentionStore;
    /** "YYYY-MM-DD": prenotazioni con data anteriore sono scadute. */
    cutoffDate: string;
    /** true = nessuna scrittura, si contano solo le righe candidate. */
    dryRun: boolean;
    maxGuestsPerRun: number;
    maxOrphanReservationsPerRun: number;
    /**
     * Log aggregato. NESSUN dato personale e nessun identificativo di persona
     * (`guest_id` è pseudonimo, ma resta un puntatore a un individuo): un job
     * che esiste per cancellare dati personali non può seminarli nei log.
     * Solo conteggi e `tenant_id`.
     */
    log: (event: string, meta?: Record<string, unknown>) => void;
}

export interface RetentionTenantError {
    tenant_id: string;
    step: "anonymize_guest_reservations" | "delete_guests" | "anonymize_orphans";
    message: string;
}

export interface RetentionSummary {
    dry_run: boolean;
    cutoff_date: string;
    guests_selected: number;
    guests_deleted: number;
    guest_reservations_anonymized: number;
    orphan_reservations_selected: number;
    orphan_reservations_anonymized: number;
    tenants_processed: number;
    /** true quando la selezione ha saturato il limite: NON è "ho finito". */
    guests_limit_reached: boolean;
    orphans_limit_reached: boolean;
    errors: RetentionTenantError[];
}

function groupByTenant<T>(rows: readonly T[], tenantOf: (row: T) => string): Map<string, T[]> {
    const out = new Map<string, T[]>();
    for (const row of rows) {
        const key = tenantOf(row);
        const bucket = out.get(key);
        if (bucket) bucket.push(row);
        else out.set(key, [row]);
    }
    return out;
}

/**
 * Esegue un tick di retention. Non lancia: ogni errore per-tenant finisce in
 * `summary.errors` e l'esecuzione prosegue con gli altri tenant — un tenant con
 * un problema non deve impedire la cancellazione a tutti gli altri.
 */
export async function runRetentionTick(deps: RetentionTickDeps): Promise<RetentionSummary> {
    const {
        store,
        cutoffDate,
        dryRun,
        maxGuestsPerRun,
        maxOrphanReservationsPerRun,
        log
    } = deps;

    const summary: RetentionSummary = {
        dry_run: dryRun,
        cutoff_date: cutoffDate,
        guests_selected: 0,
        guests_deleted: 0,
        guest_reservations_anonymized: 0,
        orphan_reservations_selected: 0,
        orphan_reservations_anonymized: 0,
        tenants_processed: 0,
        guests_limit_reached: false,
        orphans_limit_reached: false,
        errors: []
    };

    log("retention_run_started", {
        dry_run: dryRun,
        cutoff_date: cutoffDate,
        max_guests: maxGuestsPerRun,
        max_orphans: maxOrphanReservationsPerRun
    });

    // ── 1. SELEZIONE ────────────────────────────────────────────────────────
    // Prima di qualsiasi scrittura, e tenuta in memoria: vedi l'header.
    const guestsRes = await store.listExpiredGuests(cutoffDate, maxGuestsPerRun);
    if (guestsRes.error) {
        log("retention_select_guests_failed", { message: guestsRes.error.message });
        return summary;
    }
    const expiredGuests = guestsRes.data ?? [];
    summary.guests_selected = expiredGuests.length;
    summary.guests_limit_reached = expiredGuests.length >= maxGuestsPerRun;

    const orphansRes = await store.listExpiredOrphanReservations(
        cutoffDate,
        maxOrphanReservationsPerRun
    );
    if (orphansRes.error) {
        log("retention_select_orphans_failed", { message: orphansRes.error.message });
    }
    const expiredOrphans = orphansRes.data ?? [];
    summary.orphan_reservations_selected = expiredOrphans.length;
    summary.orphans_limit_reached = expiredOrphans.length >= maxOrphanReservationsPerRun;

    if (summary.guests_limit_reached) {
        // Troncatura dichiarata: senza questo log un "guests_deleted: 500"
        // si legge come "non c'era altro", che è falso.
        log("retention_guests_limit_reached", { limit: maxGuestsPerRun });
    }
    if (summary.orphans_limit_reached) {
        log("retention_orphans_limit_reached", { limit: maxOrphanReservationsPerRun });
    }

    const guestsByTenant = groupByTenant(expiredGuests, g => g.tenant_id);
    const orphansByTenant = groupByTenant(expiredOrphans, o => o.tenant_id);
    const tenantIds = new Set<string>([...guestsByTenant.keys(), ...orphansByTenant.keys()]);
    summary.tenants_processed = tenantIds.size;

    for (const tenantId of tenantIds) {
        const guestIds = (guestsByTenant.get(tenantId) ?? []).map(g => g.guest_id);
        const orphanIds = (orphansByTenant.get(tenantId) ?? []).map(o => o.reservation_id);

        if (dryRun) {
            // Nessuna scrittura. I conteggi restano quelli dei candidati: in
            // dry-run "quante righe cambierebbero" è una stima, non un fatto.
            log("retention_tenant_dry_run", {
                tenant_id: tenantId,
                guests: guestIds.length,
                orphan_reservations: orphanIds.length
            });
            continue;
        }

        // ── 2. ANONIMIZZAZIONE (ramo con profilo) ───────────────────────────
        // Tutte le prenotazioni del profilo, non solo quelle vecchie: il
        // criterio è la persona, e la persona è scaduta per intero.
        let guestReservationsDone = false;
        if (guestIds.length > 0) {
            const res = await store.anonymizeReservationsOfGuests(tenantId, guestIds);
            if (res.error) {
                summary.errors.push({
                    tenant_id: tenantId,
                    step: "anonymize_guest_reservations",
                    message: res.error.message
                });
            } else {
                summary.guest_reservations_anonymized += res.data ?? 0;
                guestReservationsDone = true;
            }
        }

        // ── 3. CANCELLAZIONE DEI PROFILI ────────────────────────────────────
        // Solo se l'anonimizzazione è andata a buon fine: cancellare il profilo
        // lasciando le prenotazioni con nome e telefono in chiaro sposterebbe
        // il dato personale invece di rimuoverlo.
        if (guestIds.length > 0 && guestReservationsDone) {
            const res = await store.deleteGuests(tenantId, guestIds);
            if (res.error) {
                summary.errors.push({
                    tenant_id: tenantId,
                    step: "delete_guests",
                    message: res.error.message
                });
            } else {
                summary.guests_deleted += res.data ?? 0;
            }
        }

        // ── 2-bis. ANONIMIZZAZIONE (ramo orfano) ────────────────────────────
        if (orphanIds.length > 0) {
            const res = await store.anonymizeReservationsById(tenantId, orphanIds);
            if (res.error) {
                summary.errors.push({
                    tenant_id: tenantId,
                    step: "anonymize_orphans",
                    message: res.error.message
                });
            } else {
                summary.orphan_reservations_anonymized += res.data ?? 0;
            }
        }
    }

    log("retention_run_completed", {
        dry_run: summary.dry_run,
        cutoff_date: summary.cutoff_date,
        guests_selected: summary.guests_selected,
        guests_deleted: summary.guests_deleted,
        guest_reservations_anonymized: summary.guest_reservations_anonymized,
        orphan_reservations_selected: summary.orphan_reservations_selected,
        orphan_reservations_anonymized: summary.orphan_reservations_anonymized,
        tenants_processed: summary.tenants_processed,
        guests_limit_reached: summary.guests_limit_reached,
        orphans_limit_reached: summary.orphans_limit_reached,
        errors: summary.errors.length
    });

    return summary;
}

/**
 * Soglia di conservazione → data limite "YYYY-MM-DD".
 * Wall-clock locale come il resto del dominio prenotazioni (`reservation_date`
 * è una data senza fuso: la prenotazione delle 20:00 è alle 20:00 del locale).
 */
export function retentionCutoffDate(now: Date, retentionMonths: number): string {
    const d = new Date(now.getFullYear(), now.getMonth() - retentionMonths, now.getDate());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
