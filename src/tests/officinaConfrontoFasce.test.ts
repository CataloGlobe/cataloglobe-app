import { describe, expect, it } from "vitest";
import { giudiceConFasce, simulaM1, slotActiveNow, type SnapshotConFasce } from "../../scripts/officina-confronto/fasce";
import { calcolaEsito, confronta, type Snapshot, type SnapshotSchedule } from "../../scripts/officina-confronto/model";
import { toRomeDateTime } from "../../supabase/functions/_shared/schedulingNow";

const T1 = "tenant-1";
const MONDAY = "2026-10-12";

function rule(partial: Partial<SnapshotSchedule> & Pick<SnapshotSchedule, "id">): SnapshotSchedule {
    return {
        tenant_id: T1,
        name: partial.id,
        rule_type: "layout",
        enabled: true,
        apply_to_all: true,
        priority: 21,
        created_at: "2026-01-01T00:00:00Z",
        time_mode: "always",
        days_of_week: null,
        time_from: null,
        time_to: null,
        start_at: null,
        end_at: null,
        ...partial
    };
}

function snapshot(schedules: SnapshotSchedule[], extra: Partial<Snapshot> = {}): Snapshot {
    return {
        fonte: "test",
        letta_il: "2026-10-13T00:00:00Z",
        activities: [
            { id: "sede-1", tenant_id: T1, tenant_name: "Azienda", name: "Sede 1", status: "active", group_ids: [] },
            { id: "sede-2", tenant_id: T1, tenant_name: "Azienda", name: "Sede 2", status: "active", group_ids: [] }
        ],
        schedules,
        targets: [],
        layouts: schedules
            .filter(s => s.rule_type === "layout")
            .map(s => ({ schedule_id: s.id, catalog_id: `menu-${s.id}`, style_id: null })),
        featured_links: [],
        ...extra
    };
}

/** Istante in ora di Roma, ottobre 2026 (ora legale fino al 25: UTC+2). */
function rome(day: number, hh: number, mm = 0) {
    return toRomeDateTime(new Date(Date.UTC(2026, 9, day, hh - 2, mm)));
}

describe("simulaM1", () => {
    it("riempie le fasce come la migrazione, col giudice di oggi", () => {
        const sim = simulaM1(
            snapshot([
                rule({ id: "sempre" }),
                rule({ id: "giorni", time_mode: "window", days_of_week: [1, 2] }),
                rule({ id: "pranzo", time_mode: "window", time_from: "12:15:00", time_to: "15:15:00" }),
                rule({ id: "sera", time_mode: "window", time_from: "19:00:00", time_to: "23:59:00" }),
                rule({ id: "notte", time_mode: "window", days_of_week: [5], time_from: "19:00:00", time_to: "02:00:00" }),
                rule({ id: "sempre-giorni", days_of_week: [6, 0] }),
                rule({ id: "senza-ore", time_mode: "window" }),
                rule({ id: "uguali", time_mode: "window", time_from: "12:00:00", time_to: "12:00:00" })
            ])
        );
        const bySchedule = Object.fromEntries(sim.slots.map(s => [s.schedule_id, s]));
        expect(bySchedule.sempre).toBeUndefined();
        expect(bySchedule.giorni).toMatchObject({ days_of_week: [1, 2], start_minute: 0, end_minute: 1440 });
        expect(bySchedule.pranzo).toMatchObject({ days_of_week: null, start_minute: 735, end_minute: 915 });
        expect(bySchedule.sera).toMatchObject({ start_minute: 1140, end_minute: 1440 });
        expect(bySchedule.notte).toMatchObject({ days_of_week: [], start_minute: 0, end_minute: 1440 });
        expect(bySchedule["sempre-giorni"]).toBeUndefined();
        expect(bySchedule["senza-ore"]).toBeUndefined();
        expect(bySchedule.uguali).toMatchObject({ days_of_week: [], start_minute: 0, end_minute: 1440 });
    });

    it("non riempie due volte una regola che ha già le fasce", () => {
        const sim = simulaM1(
            snapshot([rule({ id: "pranzo", time_mode: "window", time_from: "12:00:00", time_to: "15:00:00" })], {
                slots: [{ id: "vera", schedule_id: "pranzo", days_of_week: null, start_minute: 600, end_minute: 660 }]
            })
        );
        expect(sim.slots).toEqual([
            { id: "vera", schedule_id: "pranzo", days_of_week: null, start_minute: 600, end_minute: 660 }
        ]);
    });
});

describe("slotActiveNow", () => {
    const notte = { id: "n", schedule_id: "r", days_of_week: [5], start_minute: 1140, end_minute: 1560 };

    it("venerdì 19:00-02:00 vale venerdì sera e sabato fino alle 2", () => {
        expect(slotActiveNow(notte, rome(16, 18, 45))).toBe(false); // ven
        expect(slotActiveNow(notte, rome(16, 19, 0))).toBe(true);
        expect(slotActiveNow(notte, rome(17, 1, 30))).toBe(true); // sab
        expect(slotActiveNow(notte, rome(17, 2, 0))).toBe(false);
        expect(slotActiveNow(notte, rome(18, 1, 30))).toBe(false); // dom: sabato non c'è
    });
});

describe("giudice con le fasce", () => {
    it("sulle regole di oggi dà lo stesso esito del giudice di oggi", () => {
        const snap = snapshot([
            rule({ id: "sempre" }),
            rule({ id: "settimana", time_mode: "window", days_of_week: [1, 2, 3, 4, 5] }),
            rule({ id: "pranzo", time_mode: "window", days_of_week: [1, 2, 3, 4, 5], time_from: "12:00:00", time_to: "15:00:00" }),
            rule({
                id: "periodo",
                time_mode: "window",
                time_from: "12:15:00",
                time_to: "15:15:00",
                start_at: "2026-10-08T22:00:00Z",
                end_at: "2026-11-08T22:59:59Z"
            }),
            rule({ id: "solo-inizio", time_mode: "window", time_from: "10:00:00", time_to: "11:00:00", start_at: "2026-01-01T00:00:00Z" })
        ]);
        const prima = calcolaEsito(snap, MONDAY);
        const dopo = calcolaEsito(simulaM1(snap), MONDAY, { giudice: giudiceConFasce, nomeGiudice: "fasce" });
        expect(confronta(prima, dopo)).toEqual([]);
    });

    it("una fine prima dell'inizio resta mai attiva, come oggi", () => {
        const snap = snapshot([
            rule({ id: "sempre" }),
            rule({ id: "notte", time_mode: "window", days_of_week: [5], time_from: "22:00:00", time_to: "02:00:00" })
        ]);
        const diffs = confronta(
            calcolaEsito(snap, MONDAY),
            calcolaEsito(simulaM1(snap), MONDAY, { giudice: giudiceConFasce })
        ).filter(d => d.sede === "Sede 1");
        expect(diffs).toEqual([]);
    });

    it("una fascia con le sue sedi vale solo lì (M2)", () => {
        const snap: SnapshotConFasce = {
            ...snapshot([rule({ id: "sempre" }), rule({ id: "pranzo", time_mode: "window" })]),
            slots: [{ id: "f1", schedule_id: "pranzo", days_of_week: null, start_minute: 720, end_minute: 900 }],
            slot_targets: [{ slot_id: "f1", target_type: "activity", target_id: "sede-2" }]
        };
        const esito = calcolaEsito(snap, MONDAY, { giudice: giudiceConFasce });
        const sede1 = esito.sedi.find(s => s.id === "sede-1")!.strati.layout;
        const sede2 = esito.sedi.find(s => s.id === "sede-2")!.strati.layout;
        expect(sede1.every(t => t.regola === "sempre")).toBe(true);
        expect(sede2.slice(0, 3).map(t => [t.quando, t.regola])).toEqual([
            ["lun 00:00", "sempre"],
            ["lun 12:00", "pranzo"],
            ["lun 15:00", "sempre"]
        ]);
    });
});
