import { describe, expect, it } from "vitest";
import { entriesFromRules, whenOfRule } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { ruleTypeLabel } from "@/pages/Dashboard/Programming/ruleTypeLabel";
import { isLayoutRuleDraft } from "@/utils/scheduleDraft";
import type { LayoutRule } from "@/services/supabase/layoutScheduling";

// Multi menù, passo 4: le regole `menu` e `style` salvate da save_schedule_model
// arrivano con il loro pezzo in `layout` e le ore nelle fasce.
let n = 0;
const rule = (o: Partial<LayoutRule>): LayoutRule =>
    ({
        id: "r" + ++n,
        tenant_id: "t",
        name: null,
        rule_type: "menu",
        target_type: "",
        target_id: "",
        target_group: null,
        applyToAll: true,
        activityIds: [],
        groupIds: [],
        visibility_mode: "hide",
        priority: 10,
        priority_level: "normal",
        display_order: 0,
        enabled: true,
        time_mode: "window",
        days_of_week: null,
        time_from: null,
        time_to: null,
        start_at: null,
        end_at: null,
        created_at: "2026-09-01T10:00:00Z",
        layout: { catalog_id: "bar", style_id: null },
        price_overrides: [],
        visibility_overrides: [],
        featured_contents: [],
        ...o
    }) as LayoutRule;

const slot = (start: number, end: number, days: number[] | null = null) => ({ id: `s${start}`, days_of_week: days, start_minute: start, end_minute: end, activityIds: [], groupIds: [] });
const names = { catalogs: new Map([["bar", "Bar"], ["cucina", "Cucina"]]), styles: new Map([["chiaro", "Chiaro"]]), featured: new Map(), products: new Map() };

describe("regole menu e style nel Calendario", () => {
    it("le ore vengono dalle fasce: due fasce, giorni dal lunedì", () => {
        // colonne di oggi: solo la prima fascia
        const r = rule({ days_of_week: [1, 2, 3, 4, 5], time_from: "12:00", time_to: "15:00", slots: [slot(720, 900, [1, 2, 3, 4, 5]), slot(1140, 1380, [1, 2, 3, 4, 5])] });
        expect(whenOfRule(r)).toEqual({ days: [0, 1, 2, 3, 4], ranges: [[720, 900], [1140, 1380]] });
    });

    it("una fascia oltre mezzanotte resta oltre 1440", () => {
        expect(whenOfRule(rule({ time_from: "19:00", time_to: "02:00", slots: [slot(1140, 1560)] }))).toEqual({ ranges: [[1140, 1560]] });
    });

    it("senza fasce vale sempre; le regole layout leggono ancora le colonne", () => {
        expect(whenOfRule(rule({ time_mode: "always", slots: [] }))).toEqual({});
        const layout = rule({ rule_type: "layout", layout: { catalog_id: "bar", style_id: null }, time_from: "12:00", time_to: "15:00", slots: [slot(0, 1440)] });
        expect(whenOfRule(layout)).toEqual({ ranges: [[720, 900]] });
    });

    it("un menù «insieme» si aggiunge, «al posto» copre; lo stile c'è; conta quando è andato in onda", () => {
        const insieme = rule({ overlap_mode: "together", on_air_since: "2026-10-01T08:00:00Z" });
        const posto = rule({ overlap_mode: "replace", layout: { catalog_id: "cucina", style_id: null } });
        const stile = rule({ rule_type: "style", layout: { catalog_id: null, style_id: "chiaro" } });
        const es = entriesFromRules([insieme, posto, stile], names);
        expect(es.map(e => [e.kind, e.thing, e.add])).toEqual([
            ["menu", "Bar", true],
            ["menu", "Cucina", false],
            ["style", "Chiaro", false]
        ]);
        expect(es[0].created).toBe(Date.parse("2026-10-01T08:00:00Z"));
        expect(es[1].created).toBe(Date.parse("2026-09-01T10:00:00Z"));
    });

    it("spente: menu e style ci sono come le layout", () => {
        const es = entriesFromRules([rule({ enabled: false }), rule({ enabled: false, rule_type: "price" })], names, true);
        expect(es.map(e => e.kind)).toEqual(["menu"]);
    });

    it("bozza: senza menù o stile; etichette del tipo", () => {
        expect(isLayoutRuleDraft(rule({ layout: null }))).toBe(true);
        expect(isLayoutRuleDraft(rule({}))).toBe(false);
        expect(isLayoutRuleDraft(rule({ rule_type: "style", layout: { catalog_id: null, style_id: "chiaro" } }))).toBe(false);
        expect(ruleTypeLabel("menu", "Menù")).toBe("Menù");
        expect(ruleTypeLabel("style", "Menù")).toBe("Stile");
    });
});
