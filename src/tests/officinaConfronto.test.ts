import { describe, expect, it } from "vitest";
import {
    calcolaEsito,
    confronta,
    labelRome,
    romeMidnightEpoch,
    weekInstants,
    type Snapshot,
    type SnapshotSchedule
} from "../../scripts/officina-confronto/model";

const T1 = "tenant-1";
const T2 = "tenant-2";

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
            { id: "sede-1", tenant_id: T1, tenant_name: "Azienda 1", name: "Sede 1", status: "active", group_ids: [] },
            { id: "sede-2", tenant_id: T2, tenant_name: "Azienda 2", name: "Sede 2", status: "active", group_ids: [] }
        ],
        schedules,
        targets: [],
        layouts: schedules
            .filter(s => s.rule_type === "layout")
            .map(s => ({ schedule_id: s.id, catalog_id: `menu-${s.id}`, style_id: `stile-${s.id}` })),
        featured_links: [],
        ...extra
    };
}

const MONDAY = "2026-10-12";

describe("settimana", () => {
    it("ha 672 quarti d'ora in una settimana normale", () => {
        expect(weekInstants(MONDAY)).toHaveLength(672);
        expect(labelRome(romeMidnightEpoch(MONDAY))).toBe("lun 00:00");
    });

    it("ha 676 quarti d'ora nella settimana in cui finisce l'ora legale", () => {
        // 25 ottobre 2026: la domenica dura 25 ore.
        expect(weekInstants("2026-10-19")).toHaveLength(676);
    });

    it("rifiuta un giorno che non è lunedì", () => {
        expect(() => weekInstants("2026-10-13")).toThrow(/lunedì/);
    });
});

describe("esito col giudice di oggi", () => {
    it("la fascia più precisa vince sulla regola «sempre», solo nelle sue ore", () => {
        const esito = calcolaEsito(
            snapshot([
                rule({ id: "sempre" }),
                rule({
                    id: "pranzo",
                    time_mode: "window",
                    days_of_week: [1, 2, 3, 4, 5],
                    time_from: "12:00:00",
                    time_to: "15:00:00"
                })
            ]),
            MONDAY
        );
        const layout = esito.sedi.find(s => s.id === "sede-1")!.strati.layout;
        expect(layout.slice(0, 3).map(t => [t.quando, t.regola, t.altre])).toEqual([
            ["lun 00:00", "sempre", []],
            ["lun 12:00", "pranzo", ["sempre"]],
            ["lun 15:00", "sempre", []]
        ]);
        // 5 pranzi, ognuno spezza la giornata in tre tratti; sabato e domenica uniti.
        expect(layout.filter(t => t.regola === "pranzo")).toHaveLength(5);
        expect(layout[1].cosa).toBe("menu:menu-pranzo stile:stile-pranzo");
    });

    it("una fascia oltre la mezzanotte oggi non è mai attiva", () => {
        const esito = calcolaEsito(
            snapshot([
                rule({ id: "sempre" }),
                rule({ id: "notte", time_mode: "window", time_from: "22:00:00", time_to: "02:00:00" })
            ]),
            MONDAY
        );
        const layout = esito.sedi.find(s => s.id === "sede-1")!.strati.layout;
        expect(layout).toHaveLength(1);
        expect(layout[0].regola).toBe("sempre");
    });

    it("le regole di un'altra azienda non arrivano alla sede", () => {
        const esito = calcolaEsito(snapshot([rule({ id: "altra", tenant_id: T2 })]), MONDAY);
        expect(esito.sedi.find(s => s.id === "sede-1")!.strati.layout[0].regola).toBeNull();
        expect(esito.sedi.find(s => s.id === "sede-2")!.strati.layout[0].regola).toBe("altra");
    });

    it("la regola mirata alla sede batte quella per tutte le sedi", () => {
        const esito = calcolaEsito(
            snapshot([rule({ id: "tutte" }), rule({ id: "mirata", apply_to_all: false })], {
                targets: [{ schedule_id: "mirata", target_type: "activity", target_id: "sede-1" }]
            }),
            MONDAY
        );
        expect(esito.sedi.find(s => s.id === "sede-1")!.strati.layout[0].regola).toBe("mirata");
    });

    it("in evidenza: prima i contenuti sopra il menù, niente bozze", () => {
        const esito = calcolaEsito(
            snapshot([rule({ id: "evid", rule_type: "featured" })], {
                featured_links: [
                    { schedule_id: "evid", featured_content_id: "c-sotto", slot: "after_catalog", sort_order: 0, status: "published" },
                    { schedule_id: "evid", featured_content_id: "c-sopra-2", slot: "before_catalog", sort_order: 2, status: "published" },
                    { schedule_id: "evid", featured_content_id: "c-sopra-1", slot: "before_catalog", sort_order: 1, status: "published" },
                    { schedule_id: "evid", featured_content_id: "c-bozza", slot: "before_catalog", sort_order: 0, status: "draft" }
                ]
            }),
            MONDAY
        );
        expect(esito.sedi.find(s => s.id === "sede-1")!.strati.featured[0].cosa).toBe(
            "sopra:c-sopra-1 sopra:c-sopra-2 sotto:c-sotto"
        );
    });
});

describe("confronto", () => {
    const base = [
        rule({ id: "sempre" }),
        rule({ id: "pranzo", time_mode: "window", days_of_week: [1], time_from: "12:00:00", time_to: "15:00:00" })
    ];

    it("stessi dati: nessuna differenza", () => {
        const prima = calcolaEsito(snapshot(base), MONDAY);
        const dopo = calcolaEsito(snapshot(base), MONDAY, { nomeGiudice: "dopo" });
        expect(confronta(prima, dopo)).toEqual([]);
    });

    it("trova il tratto in cui il cliente vede un altro menù", () => {
        const prima = calcolaEsito(snapshot(base), MONDAY);
        const changed = snapshot(base);
        changed.layouts = changed.layouts.map(l =>
            l.schedule_id === "pranzo" ? { ...l, catalog_id: "menu-diverso" } : l
        );
        const diffs = confronta(prima, calcolaEsito(changed, MONDAY));
        expect(diffs).toHaveLength(1);
        expect(diffs[0]).toMatchObject({
            sede: "Sede 1",
            strato: "layout",
            quando: "lun 12:00",
            prima: "menu:menu-pranzo stile:stile-pranzo",
            dopo: "menu:menu-diverso stile:stile-pranzo"
        });
        expect(labelRome(Date.parse(diffs[0].a))).toBe("lun 15:00");
    });

    it("una regola diversa con lo stesso menù e stile non è una differenza", () => {
        const prima = calcolaEsito(snapshot(base), MONDAY);
        const renamed = snapshot([
            rule({ id: "sempre" }),
            rule({ id: "pranzo-2", time_mode: "window", days_of_week: [1], time_from: "12:00:00", time_to: "15:00:00" })
        ]);
        renamed.layouts = renamed.layouts.map(l =>
            l.schedule_id === "pranzo-2" ? { ...l, catalog_id: "menu-pranzo", style_id: "stile-pranzo" } : l
        );
        expect(confronta(prima, calcolaEsito(renamed, MONDAY))).toEqual([]);
    });

    it("rifiuta settimane diverse", () => {
        const prima = calcolaEsito(snapshot(base), MONDAY);
        const dopo = calcolaEsito(snapshot(base), "2026-10-19");
        expect(() => confronta(prima, dopo)).toThrow(/settimane diverse/);
    });
});
