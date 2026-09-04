// =============================================================================
// Unit test — runRetentionTick (cancellazione prenotazioni a 36 mesi)
// =============================================================================
//
// Lo store finto NON è un mock passivo: replica le due regole del database che
// il job deve rispettare, così i test verificano il criterio e non se stessi.
//
//   1. La selezione dei profili scaduti applica il NOT EXISTS della migration
//      (`list_expired_reservation_guests`): un profilo con anche UNA sola
//      prenotazione dalla soglia in poi non è scaduto.
//   2. L'UPDATE di anonimizzazione ri-esegue la semantica del trigger
//      `reservations_link_guest`: se il patch NON azzera `customer_phone_e164`,
//      il profilo viene RICREATO. È il modo per far fallire il test se qualcuno
//      toglie quella colonna dal patch credendola ridondante.
//
// La correttezza del SQL vero (le due funzioni della migration) non è coperta
// qui: Vitest gira in node, senza database.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
    ANONYMIZED_PLACEHOLDER,
    retentionCutoffDate,
    runRetentionTick,
    type ExpiredGuest,
    type ExpiredOrphanReservation,
    type RetentionStore
} from "../../supabase/functions/_shared/reservationRetention";

/** Soglia arbitraria: `runRetentionTick` riceve la DATA di taglio, non il numero
 *  di mesi di conservazione — quello vive in `RETENTION_MONTHS`
 *  (`purge-reservation-data`) ed è coperto dal test su `retentionCutoffDate` in
 *  fondo al file. Qui le date "vecchie" stanno prima della soglia, le "recenti"
 *  dopo: cambiare la policy da 24 a 36 mesi non tocca queste fixture. */
const CUTOFF = "2024-09-03";

interface GuestRow {
    id: string;
    tenant_id: string;
    phone_e164: string;
    display_name: string;
}

interface ReservationRow {
    id: string;
    tenant_id: string;
    guest_id: string | null;
    reservation_date: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    customer_phone_e164: string | null;
    notes: string | null;
    customer_language: string | null;
}

interface AnonymizationPatch {
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    customer_phone_e164: string | null;
    notes: string | null;
    customer_language: string | null;
}

/** Patch reale della edge function. Duplicato qui di proposito: se in index.ts
 *  qualcuno toglie `customer_phone_e164`, questo test continua a passare — è il
 *  test "il trigger non ricrea" più sotto a usare il patch mutilato e a
 *  dimostrare cosa succederebbe. */
const REAL_PATCH: AnonymizationPatch = {
    customer_name: ANONYMIZED_PLACEHOLDER,
    customer_email: ANONYMIZED_PLACEHOLDER,
    customer_phone: ANONYMIZED_PLACEHOLDER,
    customer_phone_e164: null,
    notes: null,
    customer_language: null
};

class FakeDb {
    guests: GuestRow[];
    reservations: ReservationRow[];
    failAnonymizeForTenant: string | null = null;

    constructor(guests: GuestRow[], reservations: ReservationRow[]) {
        this.guests = [...guests];
        this.reservations = [...reservations];
    }

    /** Semantica del trigger BEFORE UPDATE `reservations_link_guest`. */
    private applyLinkGuestTrigger(row: ReservationRow): void {
        if (row.customer_phone_e164 === null) {
            row.guest_id = null;
            return;
        }
        const existing = this.guests.find(
            g => g.tenant_id === row.tenant_id && g.phone_e164 === row.customer_phone_e164
        );
        if (existing) {
            existing.display_name = row.customer_name;
            row.guest_id = existing.id;
            return;
        }
        // INSERT … ON CONFLICT DO UPDATE: profilo ricreato da zero.
        const recreated: GuestRow = {
            id: `recreated-${row.id}`,
            tenant_id: row.tenant_id,
            phone_e164: row.customer_phone_e164,
            display_name: row.customer_name
        };
        this.guests.push(recreated);
        row.guest_id = recreated.id;
    }

    private applyPatch(rows: ReservationRow[], patch: AnonymizationPatch): number {
        for (const row of rows) {
            row.customer_name = patch.customer_name;
            row.customer_email = patch.customer_email;
            row.customer_phone = patch.customer_phone;
            row.customer_phone_e164 = patch.customer_phone_e164;
            row.notes = patch.notes;
            row.customer_language = patch.customer_language;
            this.applyLinkGuestTrigger(row);
        }
        return rows.length;
    }

    store(patch: AnonymizationPatch = REAL_PATCH): RetentionStore {
        return {
            listExpiredGuests: async (cutoffDate, limit) => {
                const rows: ExpiredGuest[] = this.guests
                    .filter(
                        g =>
                            !this.reservations.some(
                                r => r.guest_id === g.id && r.reservation_date >= cutoffDate
                            )
                    )
                    .slice(0, limit)
                    .map(g => ({ guest_id: g.id, tenant_id: g.tenant_id }));
                return { data: rows, error: null };
            },

            listExpiredOrphanReservations: async (cutoffDate, limit) => {
                const rows: ExpiredOrphanReservation[] = this.reservations
                    .filter(
                        r =>
                            r.guest_id === null &&
                            r.reservation_date < cutoffDate &&
                            r.customer_name !== ANONYMIZED_PLACEHOLDER
                    )
                    .slice(0, limit)
                    .map(r => ({ reservation_id: r.id, tenant_id: r.tenant_id }));
                return { data: rows, error: null };
            },

            anonymizeReservationsOfGuests: async (tenantId, guestIds) => {
                if (this.failAnonymizeForTenant === tenantId) {
                    return { data: null, error: { message: "boom" } };
                }
                const rows = this.reservations.filter(
                    r => r.tenant_id === tenantId && r.guest_id !== null && guestIds.includes(r.guest_id)
                );
                return { data: this.applyPatch(rows, patch), error: null };
            },

            anonymizeReservationsById: async (tenantId, reservationIds) => {
                const rows = this.reservations.filter(
                    r => r.tenant_id === tenantId && reservationIds.includes(r.id)
                );
                return { data: this.applyPatch(rows, patch), error: null };
            },

            deleteGuests: async (tenantId, guestIds) => {
                const before = this.guests.length;
                this.guests = this.guests.filter(
                    g => !(g.tenant_id === tenantId && guestIds.includes(g.id))
                );
                // FK `reservations_guest_id_fkey` ON DELETE SET NULL.
                for (const r of this.reservations) {
                    if (r.guest_id !== null && guestIds.includes(r.guest_id)) r.guest_id = null;
                }
                return { data: before - this.guests.length, error: null };
            }
        };
    }
}

function reservation(over: Partial<ReservationRow> & { id: string; reservation_date: string }): ReservationRow {
    return {
        tenant_id: "t1",
        guest_id: null,
        customer_name: "Mario Rossi",
        customer_email: "mario@example.com",
        customer_phone: "333 1234567",
        customer_phone_e164: null,
        notes: "tavolo vicino alla finestra",
        customer_language: "it",
        ...over
    };
}

function runWith(db: FakeDb, over: Partial<Parameters<typeof runRetentionTick>[0]> = {}) {
    return runRetentionTick({
        store: db.store(),
        cutoffDate: CUTOFF,
        dryRun: false,
        maxGuestsPerRun: 100,
        maxOrphanReservationsPerRun: 100,
        log: () => {},
        ...over
    });
}

describe("runRetentionTick — ramo con profilo", () => {
    it("cliente con ultima prenotazione a 25 mesi: profilo cancellato, prenotazioni anonimizzate", async () => {
        const db = new FakeDb(
            [{ id: "g1", tenant_id: "t1", phone_e164: "+393331234567", display_name: "Mario Rossi" }],
            [
                reservation({
                    id: "r1",
                    reservation_date: "2024-08-01",
                    guest_id: "g1",
                    customer_phone_e164: "+393331234567"
                })
            ]
        );

        const summary = await runWith(db);

        expect(db.guests).toHaveLength(0);
        expect(summary.guests_deleted).toBe(1);
        expect(summary.guest_reservations_anonymized).toBe(1);

        const row = db.reservations[0]!;
        expect(row.customer_name).toBe(ANONYMIZED_PLACEHOLDER);
        expect(row.customer_email).toBe(ANONYMIZED_PLACEHOLDER);
        expect(row.customer_phone).toBe(ANONYMIZED_PLACEHOLDER);
        expect(row.customer_phone_e164).toBeNull();
        expect(row.notes).toBeNull();
        expect(row.customer_language).toBeNull();
        // La riga resta: lo storico del locale non deve bucarsi.
        expect(row.reservation_date).toBe("2024-08-01");
    });

    it("cliente con prenotazioni a 30 e a 3 mesi: NIENTE viene toccato", async () => {
        // È il caso che distingue il criterio giusto (l'ultima visita della
        // persona) da quello sbagliato (la data della singola riga).
        const db = new FakeDb(
            [{ id: "g1", tenant_id: "t1", phone_e164: "+393331234567", display_name: "Mario Rossi" }],
            [
                reservation({
                    id: "r_vecchia",
                    reservation_date: "2024-03-01",
                    guest_id: "g1",
                    customer_phone_e164: "+393331234567"
                }),
                reservation({
                    id: "r_recente",
                    reservation_date: "2026-06-01",
                    guest_id: "g1",
                    customer_phone_e164: "+393331234567"
                })
            ]
        );

        const summary = await runWith(db);

        expect(summary.guests_selected).toBe(0);
        expect(db.guests).toHaveLength(1);
        expect(db.reservations.map(r => r.customer_name)).toEqual(["Mario Rossi", "Mario Rossi"]);
    });

    it("il trigger NON ricrea il profilo dopo l'anonimizzazione", async () => {
        const db = new FakeDb(
            [{ id: "g1", tenant_id: "t1", phone_e164: "+393331234567", display_name: "Mario Rossi" }],
            [
                reservation({
                    id: "r1",
                    reservation_date: "2024-08-01",
                    guest_id: "g1",
                    customer_phone_e164: "+393331234567"
                })
            ]
        );

        await runWith(db);

        expect(db.guests).toHaveLength(0);
        expect(db.reservations[0]!.guest_id).toBeNull();
    });

    it("senza `customer_phone_e164: null` il numero di telefono resta in chiaro", async () => {
        // Primo dei due motivi per cui quella riga del patch non è ridondante:
        // `customer_phone_e164` È il numero di telefono in forma canonica.
        // Lasciarlo significa che l'anonimizzazione non ha anonimizzato.
        const db = new FakeDb(
            [{ id: "g1", tenant_id: "t1", phone_e164: "+393331234567", display_name: "Mario Rossi" }],
            [
                reservation({
                    id: "r1",
                    reservation_date: "2024-08-01",
                    guest_id: "g1",
                    customer_phone_e164: "+393331234567"
                })
            ]
        );

        const patchMutilato: AnonymizationPatch = {
            ...REAL_PATCH,
            customer_phone_e164: "+393331234567"
        };

        await runRetentionTick({
            store: db.store(patchMutilato),
            cutoffDate: CUTOFF,
            dryRun: false,
            maxGuestsPerRun: 100,
            maxOrphanReservationsPerRun: 100,
            log: () => {}
        });

        expect(db.reservations[0]!.customer_phone_e164).toBe("+393331234567");
    });

    it("un UPDATE con e164 valorizzato su un profilo già cancellato lo RICREA", async () => {
        // Secondo motivo, ed è quello che fissa l'ordine delle operazioni:
        // l'UPDATE tocca tre delle quattro colonne che armano il trigger, il cui
        // corpo fa INSERT … ON CONFLICT. Con `customer_phone_e164` valorizzato
        // il trigger reinserisce il profilo dal numero della prenotazione.
        // Qui la sequenza è forzata a mano (cancella → anonimizza) perché è
        // proprio quella che il job NON deve avere: è la dimostrazione del
        // perché "raccogli → anonimizza → cancella" non è invertibile.
        const db = new FakeDb(
            [{ id: "g1", tenant_id: "t1", phone_e164: "+393331234567", display_name: "Mario Rossi" }],
            [
                reservation({
                    id: "r1",
                    reservation_date: "2024-08-01",
                    guest_id: "g1",
                    customer_phone_e164: "+393331234567"
                })
            ]
        );

        const storeMutilato = db.store({ ...REAL_PATCH, customer_phone_e164: "+393331234567" });
        await storeMutilato.deleteGuests("t1", ["g1"]);
        expect(db.guests).toHaveLength(0);

        await storeMutilato.anonymizeReservationsById("t1", ["r1"]);

        expect(db.guests).toHaveLength(1);
        expect(db.guests[0]!.id).toBe("recreated-r1");

        // Con il patch reale, la stessa sequenza sbagliata non ricrea nulla:
        // la guardia `IF NEW.customer_phone_e164 IS NULL` esce prima dell'INSERT.
        const db2 = new FakeDb(
            [{ id: "g1", tenant_id: "t1", phone_e164: "+393331234567", display_name: "Mario Rossi" }],
            [
                reservation({
                    id: "r1",
                    reservation_date: "2024-08-01",
                    guest_id: "g1",
                    customer_phone_e164: "+393331234567"
                })
            ]
        );
        const storeReale = db2.store();
        await storeReale.deleteGuests("t1", ["g1"]);
        await storeReale.anonymizeReservationsById("t1", ["r1"]);
        expect(db2.guests).toHaveLength(0);
    });
});

describe("runRetentionTick — ramo orfano (guest_id NULL)", () => {
    it("prenotazione senza profilo oltre la soglia: anonimizzata", async () => {
        const db = new FakeDb(
            [],
            [reservation({ id: "r1", reservation_date: "2024-08-01" })]
        );

        const summary = await runWith(db);

        expect(summary.orphan_reservations_anonymized).toBe(1);
        expect(db.reservations[0]!.customer_name).toBe(ANONYMIZED_PLACEHOLDER);
        expect(db.reservations[0]!.customer_phone_e164).toBeNull();
    });

    it("prenotazione senza profilo entro la soglia: intatta", async () => {
        const db = new FakeDb([], [reservation({ id: "r1", reservation_date: "2026-06-01" })]);

        const summary = await runWith(db);

        expect(summary.orphan_reservations_selected).toBe(0);
        expect(db.reservations[0]!.customer_name).toBe("Mario Rossi");
    });

    it("rieseguire il job non ri-anonimizza le righe già trattate (idempotenza)", async () => {
        const db = new FakeDb([], [reservation({ id: "r1", reservation_date: "2024-08-01" })]);

        await runWith(db);
        const second = await runWith(db);

        expect(second.orphan_reservations_selected).toBe(0);
        expect(second.orphan_reservations_anonymized).toBe(0);
    });
});

describe("runRetentionTick — modalità e robustezza", () => {
    it("dry-run non modifica nulla", async () => {
        const db = new FakeDb(
            [{ id: "g1", tenant_id: "t1", phone_e164: "+393331234567", display_name: "Mario Rossi" }],
            [
                reservation({
                    id: "r1",
                    reservation_date: "2024-08-01",
                    guest_id: "g1",
                    customer_phone_e164: "+393331234567"
                }),
                reservation({ id: "r2", reservation_date: "2024-08-02" })
            ]
        );
        const before = JSON.stringify({ guests: db.guests, reservations: db.reservations });

        const summary = await runWith(db, { dryRun: true });

        expect(JSON.stringify({ guests: db.guests, reservations: db.reservations })).toBe(before);
        expect(summary.guests_deleted).toBe(0);
        expect(summary.guest_reservations_anonymized).toBe(0);
        expect(summary.orphan_reservations_anonymized).toBe(0);
        // Ma il candidato è stato contato: è il senso del dry-run.
        expect(summary.guests_selected).toBe(1);
        expect(summary.orphan_reservations_selected).toBe(1);
    });

    it("il limite raggiunto è dichiarato, non silenzioso", async () => {
        const db = new FakeDb(
            [],
            [
                reservation({ id: "r1", reservation_date: "2024-08-01" }),
                reservation({ id: "r2", reservation_date: "2024-08-02" }),
                reservation({ id: "r3", reservation_date: "2024-08-03" })
            ]
        );
        const events: string[] = [];

        const summary = await runWith(db, {
            maxOrphanReservationsPerRun: 2,
            log: event => events.push(event)
        });

        expect(summary.orphans_limit_reached).toBe(true);
        expect(events).toContain("retention_orphans_limit_reached");
        expect(summary.orphan_reservations_anonymized).toBe(2);
    });

    it("un tenant che fallisce non ferma gli altri, e il suo profilo non viene cancellato", async () => {
        const db = new FakeDb(
            [
                { id: "g1", tenant_id: "t1", phone_e164: "+393331111111", display_name: "A" },
                { id: "g2", tenant_id: "t2", phone_e164: "+393332222222", display_name: "B" }
            ],
            [
                reservation({
                    id: "r1",
                    tenant_id: "t1",
                    reservation_date: "2024-08-01",
                    guest_id: "g1",
                    customer_phone_e164: "+393331111111"
                }),
                reservation({
                    id: "r2",
                    tenant_id: "t2",
                    reservation_date: "2024-08-01",
                    guest_id: "g2",
                    customer_phone_e164: "+393332222222"
                })
            ]
        );
        db.failAnonymizeForTenant = "t1";

        const summary = await runWith(db);

        expect(summary.errors).toHaveLength(1);
        expect(summary.errors[0]!.tenant_id).toBe("t1");
        expect(summary.errors[0]!.step).toBe("anonymize_guest_reservations");
        // t2 completato…
        expect(db.guests.map(g => g.id)).toEqual(["g1"]);
        expect(summary.guests_deleted).toBe(1);
        // …e t1 NON cancellato: il profilo resta finché le sue prenotazioni
        // hanno ancora i dati in chiaro.
        expect(db.reservations.find(r => r.id === "r1")!.customer_name).toBe("Mario Rossi");
    });

    it("nessun log contiene identificativi di persona", async () => {
        const db = new FakeDb(
            [{ id: "g1", tenant_id: "t1", phone_e164: "+393331234567", display_name: "Mario Rossi" }],
            [
                reservation({
                    id: "r1",
                    reservation_date: "2024-08-01",
                    guest_id: "g1",
                    customer_phone_e164: "+393331234567"
                })
            ]
        );
        const metas: Record<string, unknown>[] = [];

        await runWith(db, { log: (_event, meta) => metas.push(meta ?? {}) });

        const serialized = JSON.stringify(metas);
        expect(serialized).not.toContain("Mario");
        expect(serialized).not.toContain("+393331234567");
        expect(serialized).not.toContain("g1");
    });
});

describe("retentionCutoffDate", () => {
    it("sottrae i mesi di conservazione restando su wall-clock locale", () => {
        // 36 = `RETENTION_MONTHS` dichiarato nel §7 dell'informativa.
        expect(retentionCutoffDate(new Date(2026, 8, 3), 36)).toBe("2023-09-03");
        expect(retentionCutoffDate(new Date(2026, 0, 31), 36)).toBe("2023-01-31");
    });
});
