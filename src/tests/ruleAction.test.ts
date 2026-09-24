import { describe, expect, it } from "vitest";
import { buildRuleSummary, describeRuleAction } from "@/utils/ruleHelpers";
import type { LayoutRule } from "@/services/supabase/layoutScheduling";

type ActionRule = Parameters<typeof describeRuleAction>[0];

function rule(overrides: Partial<ActionRule>): ActionRule {
    return {
        rule_type: "layout",
        layout: null,
        price_overrides: [],
        visibility_overrides: [],
        featured_contents: [],
        ...overrides
    } as ActionRule;
}

describe("describeRuleAction: il verbo del mockup, per tipo", () => {
    it("menù: mostra {menù}", () => {
        expect(describeRuleAction(rule({ rule_type: "layout" }), "Carta")).toBe("mostra Carta");
        expect(describeRuleAction(rule({ rule_type: "layout" }))).toBeNull();
    });

    it("prezzi: cambia N prezzi, al singolare con uno", () => {
        const prices = (n: number) => Array.from({ length: n }, () => ({})) as LayoutRule["price_overrides"];
        expect(describeRuleAction(rule({ rule_type: "price", price_overrides: prices(2) }))).toBe("cambia 2 prezzi");
        expect(describeRuleAction(rule({ rule_type: "price", price_overrides: prices(1) }))).toBe("cambia 1 prezzo");
        expect(describeRuleAction(rule({ rule_type: "price" }))).toBeNull();
    });

    it("disponibilità: nasconde N · non disponibile N, solo le parti che ci sono", () => {
        const modes = (...m: Array<"hide" | "disable">) => m.map(mode => ({ mode })) as LayoutRule["visibility_overrides"];
        expect(describeRuleAction(rule({ rule_type: "visibility", visibility_overrides: modes("hide", "hide", "disable") }))).toBe(
            "nasconde 2 · non disponibile 1"
        );
        expect(describeRuleAction(rule({ rule_type: "visibility", visibility_overrides: modes("disable") }))).toBe("non disponibile 1");
        expect(describeRuleAction(rule({ rule_type: "visibility" }))).toBeNull();
    });

    it("in evidenza: mostra N contenuti", () => {
        const contents = (n: number) => Array.from({ length: n }, () => ({})) as LayoutRule["featured_contents"];
        expect(describeRuleAction(rule({ rule_type: "featured", featured_contents: contents(3) }))).toBe("mostra 3 contenuti");
        expect(describeRuleAction(rule({ rule_type: "featured", featured_contents: contents(1) }))).toBe("mostra 1 contenuto");
    });
});

describe("buildRuleSummary", () => {
    it("separa i pezzi del quando con «·»", () => {
        expect(buildRuleSummary({ time_mode: "window", days_of_week: [1, 2, 3, 4, 5], time_from: "11:00", time_to: "15:00" })).toMatch(
            /^[^•]+ · 11:00–15:00$/
        );
    });
});
