import { describe, expect, it } from "vitest";
import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import { basePair, lastBaseMenu, removesLastBase } from "@/pages/Dashboard/Programming/calendar/baseRule";

// «Spegni» e «tieni pronto» sulla regola di base: il locale resterebbe senza menù (D238).

const rule = (id: string, o: Partial<LayoutRule> = {}): LayoutRule =>
    ({
        id,
        enabled: true,
        rule_type: "layout",
        applyToAll: true,
        time_mode: "always",
        start_at: null,
        end_at: null,
        layout: { catalog_id: "c" + id, style_id: "s1" },
        ...o
    }) as LayoutRule;

describe("la sola regola di base non si spegne", () => {
    it("sola regola di base accesa: bloccata", () => {
        expect(lastBaseMenu([rule("1"), rule("2", { time_mode: "window" })], "1")).toBe(true);
    });

    it("un altro menù di base acceso la sostituisce: si spegne", () => {
        expect(lastBaseMenu([rule("1"), rule("2")], "1")).toBe(false);
    });

    it("l'altro è spento, o solo in alcune sedi, o con le date: non la sostituisce", () => {
        for (const o of [{ enabled: false }, { applyToAll: false }, { start_at: "2026-10-01" }]) expect(lastBaseMenu([rule("1"), rule("2", o)], "1")).toBe(true);
    });

    it("regole che non sono di base, già spente o di altro tipo: libere", () => {
        expect(lastBaseMenu([rule("1", { time_mode: "window" })], "1")).toBe(false);
        expect(lastBaseMenu([rule("1", { enabled: false })], "1")).toBe(false);
        expect(lastBaseMenu([rule("1", { rule_type: "featured", layout: null })], "1")).toBe(false);
        expect(lastBaseMenu([rule("1")], "x")).toBe(false);
    });
});

// Eliminare la regola (una o più insieme) è come spegnerla (#537).
describe("la sola regola di base non si elimina", () => {
    it("eliminarla da sola, o con le altre di base: bloccata", () => {
        expect(removesLastBase([rule("1"), rule("2", { time_mode: "window" })], ["1"])).toBe(true);
        expect(removesLastBase([rule("1"), rule("2")], ["1", "2"])).toBe(true);
    });

    it("ne resta un'altra di base, o non se ne tocca nessuna: libera", () => {
        expect(removesLastBase([rule("1"), rule("2"), rule("3")], ["1", "2"])).toBe(false);
        expect(removesLastBase([rule("1"), rule("2", { time_mode: "window" })], ["2"])).toBe(false);
        expect(removesLastBase([rule("1")], [])).toBe(false);
    });
});

// Multi menù: le `layout` diventano una `menu` e una `style` (compito 2).
describe("menù e stile di base da regole separate", () => {
    const menu = (id: string, o: Partial<LayoutRule> = {}) => rule(id, { rule_type: "menu", layout: { catalog_id: "c" + id, style_id: null }, ...o } as Partial<LayoutRule>);
    const style = (id: string) => rule(id, { rule_type: "style", layout: { catalog_id: null, style_id: "s" + id } } as Partial<LayoutRule>);

    it("una `menu` di base conta come menù di base, una `style` no", () => {
        expect(lastBaseMenu([menu("1"), style("2")], "1")).toBe(true);
        expect(lastBaseMenu([menu("1"), menu("2")], "1")).toBe(false);
        expect(lastBaseMenu([style("2")], "2")).toBe(false);
    });

    it("la coppia viene da due regole, o da una `layout`", () => {
        expect(basePair([menu("1"), style("2")])).toEqual({ catalogId: "c1", styleId: "s2" });
        expect(basePair([rule("1")])).toEqual({ catalogId: "c1", styleId: "s1" });
    });

    it("senza stile di base, o col menù solo in alcune sedi: nessuna coppia", () => {
        expect(basePair([menu("1")])).toBeNull();
        expect(basePair([menu("1", { applyToAll: false }), style("2")])).toBeNull();
    });
});
