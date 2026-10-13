import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/supabase/client", () => ({ supabase: {} }));
vi.mock("@/services/supabase/catalogs", () => ({
    getCatalog: vi.fn(async () => ({ id: "c1", name: "Alla carta" })),
    listCategories: vi.fn(async () => []),
    listCategoryProducts: vi.fn(async () => [])
}));

import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import { loadTunnel } from "@/pages/Dashboard/Crea/creaLoad";
import type { CreaData } from "@/pages/Dashboard/Crea/useCreaData";

let n = 0;
const rule = (o: Partial<LayoutRule>): LayoutRule =>
    ({
        id: "r" + ++n,
        tenant_id: "t",
        name: null,
        rule_type: "layout",
        target_type: "",
        target_id: "",
        target_group: null,
        applyToAll: false,
        activityIds: ["a1"],
        groupIds: [],
        visibility_mode: "hide",
        priority: 10,
        priority_level: "normal",
        display_order: 0,
        enabled: true,
        time_mode: "always",
        days_of_week: null,
        time_from: null,
        time_to: null,
        start_at: null,
        end_at: null,
        created_at: "2026-09-01T10:00:00Z",
        layout: { catalog_id: "c1", style_id: "s1" } as LayoutRule["layout"],
        price_overrides: [],
        visibility_overrides: [],
        featured_contents: [],
        ...o
    }) as LayoutRule;

const data = (rules: LayoutRule[]) =>
    ({
        rules,
        names: { catalogs: new Map([["c1", "Alla carta"]]), styles: new Map([["s1", "Classico"]]), featured: new Map(), products: new Map() },
        L: { products: new Map() }
    }) as unknown as CreaData;

describe("modifica di un menù: quali regole contano (D189)", () => {
    it("una accesa e una spenta: conta l'accesa, il «Dove e quando» resta", async () => {
        const on = rule({ activityIds: ["a1"] });
        const off = rule({ activityIds: ["a2"], enabled: false });
        const { t } = await loadTunnel("menu", "c1", "t", data([on, off]));
        expect(t.edit?.rules).toBe(1);
        expect(t.edit?.ruleId).toBe(on.id);
        expect(t.where.activityIds).toEqual(["a1"]);
        expect(t.onda).toBe("on");
    });

    it("solo una spenta: è la sua voce, tenuta pronta", async () => {
        const off = rule({ activityIds: ["a2"], enabled: false });
        const { t } = await loadTunnel("menu", "c1", "t", data([off]));
        expect(t.edit?.rules).toBe(1);
        expect(t.edit?.ruleId).toBe(off.id);
        expect(t.onda).toBe("off");
    });

    it("due accese: più voci, niente «Dove e quando» unico", async () => {
        const { t } = await loadTunnel("menu", "c1", "t", data([rule({}), rule({ activityIds: ["a2"] }), rule({ enabled: false })]));
        expect(t.edit?.rules).toBe(2);
        expect(t.edit?.ruleId).toBeNull();
    });
});
