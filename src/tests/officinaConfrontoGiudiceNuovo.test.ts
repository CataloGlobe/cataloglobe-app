import { describe, expect, it } from "vitest";
import { simulaM1 } from "../../scripts/officina-confronto/fasce";
import { giudiceNuovo, type SnapshotNuovo } from "../../scripts/officina-confronto/giudiceNuovo";
import { calcolaEsito, confronta, type Snapshot, type SnapshotSchedule } from "../../scripts/officina-confronto/model";

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

function snapshot(schedules: SnapshotSchedule[], extra: Partial<SnapshotNuovo> = {}): SnapshotNuovo {
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
            .map(s => ({ schedule_id: s.id, catalog_id: `menu-${s.id}`, style_id: `stile-${s.id}` })),
        featured_links: [],
        slots: [],
        ...extra
    };
}

const esitoOggi = (s: Snapshot) => calcolaEsito(s, MONDAY);
const esitoNuovo = (s: Snapshot) => calcolaEsito(simulaM1(s), MONDAY, { giudice: giudiceNuovo, nomeGiudice: "nuovo" });

describe("giudice nuovo nello strumento del confronto", () => {
    it("sulle regole layout di oggi il cliente vede lo stesso (D83)", () => {
        const s = snapshot(
            [
                rule({ id: "base" }),
                rule({ id: "pranzo", time_mode: "window", time_from: "12:00:00", time_to: "15:00:00" }),
                rule({ id: "notte", time_mode: "window", days_of_week: [5], time_from: "19:00:00", time_to: "02:00:00" }),
                rule({ id: "sede", apply_to_all: false, created_at: "2026-05-01T00:00:00Z" }),
                rule({ id: "prezzi", rule_type: "price" }),
                rule({ id: "evidenza", rule_type: "featured" })
            ],
            {
                targets: [{ schedule_id: "sede", target_type: "activity", target_id: "sede-1" }],
                featured_links: [
                    { schedule_id: "evidenza", featured_content_id: "fc-1", slot: "before_catalog", sort_order: 0, status: "published" }
                ]
            }
        );
        expect(confronta(esitoOggi(s), esitoNuovo(s))).toEqual([]);
    });

    it("due regole di prezzi insieme: oggi una, domani tutte e due (differenza attesa, lista di Alex)", () => {
        const s = snapshot([
            rule({ id: "base" }),
            rule({ id: "p1", rule_type: "price" }),
            rule({ id: "p2", rule_type: "price", created_at: "2026-02-01T00:00:00Z" })
        ]);
        const diffs = confronta(esitoOggi(s), esitoNuovo(s));
        expect(diffs.length).toBeGreaterThan(0);
        expect(new Set(diffs.map(d => d.strato))).toEqual(new Set(["price"]));
        expect(diffs[0].prima).toBe("regola:p1");
        expect(diffs[0].dopo).toBe("regola:p2+p1");
    });

    it("in evidenza da due regole: i contenuti di tutte e due, una volta sola", () => {
        const s = snapshot(
            [
                rule({ id: "base" }),
                rule({ id: "e1", rule_type: "featured" }),
                rule({ id: "e2", rule_type: "featured", created_at: "2026-02-01T00:00:00Z" })
            ],
            {
                featured_links: [
                    { schedule_id: "e1", featured_content_id: "fc-a", slot: "after_catalog", sort_order: 0, status: "published" },
                    { schedule_id: "e2", featured_content_id: "fc-a", slot: "after_catalog", sort_order: 0, status: "published" },
                    { schedule_id: "e2", featured_content_id: "fc-b", slot: "before_catalog", sort_order: 0, status: "published" }
                ]
            }
        );
        const nuovo = esitoNuovo(s);
        expect(nuovo.sedi[0].strati.featured[0].cosa).toBe("sopra:fc-b sotto:fc-a");
    });

    it("regole menu «insieme» vere: il cliente vede i due menù", () => {
        const s = snapshot(
            [
                rule({ id: "m1", rule_type: "menu" as SnapshotSchedule["rule_type"] }),
                rule({ id: "m2", rule_type: "menu" as SnapshotSchedule["rule_type"] })
            ],
            {
                layouts: [],
                menus: [
                    { schedule_id: "m1", catalog_id: "cat-1" },
                    { schedule_id: "m2", catalog_id: "cat-2" }
                ],
                schedule_extra: [
                    { id: "m1", on_air_since: "2026-01-01T00:00:00Z", overlap_mode: "together" },
                    { id: "m2", on_air_since: "2026-02-01T00:00:00Z", overlap_mode: "together" }
                ]
            }
        );
        const nuovo = esitoNuovo(s);
        expect(nuovo.sedi[0].strati.layout[0].cosa).toBe("menu:cat-1,cat-2 stile:-");
    });
});
