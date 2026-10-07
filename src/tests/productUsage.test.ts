import { describe, it, expect } from "vitest";
import { resolveProductUsage, type UsageRule } from "@/utils/productUsage";

/**
 * Utilizzo di un prodotto (T19): le regole che lo toccano (menù che lo
 * contengono, prezzi e visibilità che lo nominano) e le sedi che quelle
 * regole raggiungono, lette dai target veri (`schedule_targets`, gruppi,
 * «tutte le sedi»), non da `schedules.target_type/target_id`.
 */
const activities = [
    { id: "a-centro", name: "Centro" },
    { id: "a-mare", name: "Mare" },
    { id: "a-porto", name: "Porto" }
];
const activityIdsByGroupId = { "g-costa": ["a-mare", "a-porto"] };

const rule = (over: Partial<UsageRule> & Pick<UsageRule, "id" | "name">): UsageRule => ({
    rule_type: "layout",
    catalogId: null,
    applyToAll: false,
    activityIds: [],
    groupIds: [],
    ...over
});

describe("resolveProductUsage", () => {
    it("menu rules count only when their catalog contains the product", () => {
        const usage = resolveProductUsage({
            catalogs: [{ id: "c-pranzo", name: "Pranzo" }],
            rules: [
                rule({ id: "r1", name: "Pranzo Centro", catalogId: "c-pranzo", activityIds: ["a-centro"] }),
                rule({ id: "r2", name: "Cena", catalogId: "c-cena", activityIds: ["a-mare"] })
            ],
            activities,
            activityIdsByGroupId
        });
        expect(usage.schedules.map(s => s.id)).toEqual(["r1"]);
        expect(usage.activities.map(a => a.name)).toEqual(["Centro"]);
    });

    it("price and visibility rules that name the product count, menu or not", () => {
        const usage = resolveProductUsage({
            catalogs: [],
            rules: [
                rule({ id: "p1", name: "Happy hour", rule_type: "price", activityIds: ["a-porto"] }),
                rule({ id: "v1", name: "Niente pesce", rule_type: "visibility", activityIds: ["a-mare"] })
            ],
            activities,
            activityIdsByGroupId
        });
        expect(usage.schedules.map(s => s.name)).toEqual(["Happy hour", "Niente pesce"]);
        expect(usage.activities.map(a => a.name)).toEqual(["Mare", "Porto"]);
    });

    it("groups reach their members, «tutte le sedi» reaches every seat", () => {
        const byGroup = resolveProductUsage({
            catalogs: [{ id: "c", name: "Menù" }],
            rules: [rule({ id: "r", name: "Costa", catalogId: "c", groupIds: ["g-costa"] })],
            activities,
            activityIdsByGroupId
        });
        expect(byGroup.activities.map(a => a.id)).toEqual(["a-mare", "a-porto"]);

        const all = resolveProductUsage({
            catalogs: [{ id: "c", name: "Menù" }],
            rules: [rule({ id: "r", name: "Ovunque", catalogId: "c", applyToAll: true })],
            activities,
            activityIdsByGroupId
        });
        expect(all.activities.map(a => a.id)).toEqual(["a-centro", "a-mare", "a-porto"]);
    });

    it("seats of other companies or deleted ones are not listed; each seat once", () => {
        const usage = resolveProductUsage({
            catalogs: [{ id: "c", name: "Menù" }],
            rules: [
                rule({ id: "r1", name: "Uno", catalogId: "c", activityIds: ["a-centro", "a-altrove"] }),
                rule({ id: "r2", name: "Due", rule_type: "price", activityIds: ["a-centro"] })
            ],
            activities,
            activityIdsByGroupId
        });
        expect(usage.activities.map(a => a.id)).toEqual(["a-centro"]);
        expect(usage.schedules).toHaveLength(2);
    });

    it("rules are listed by name; catalogs pass through", () => {
        const usage = resolveProductUsage({
            catalogs: [{ id: "c", name: "Menù" }],
            rules: [
                rule({ id: "z", name: "Zuppe", rule_type: "visibility" }),
                rule({ id: "a", name: "Aperitivo", catalogId: "c" })
            ],
            activities,
            activityIdsByGroupId
        });
        expect(usage.schedules.map(s => s.name)).toEqual(["Aperitivo", "Zuppe"]);
        expect(usage.catalogs).toEqual([{ id: "c", name: "Menù" }]);
    });
});
