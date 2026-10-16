import { describe, expect, it } from "vitest";
import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import { lastBaseMenu } from "@/pages/Dashboard/Programming/calendar/baseRule";

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
