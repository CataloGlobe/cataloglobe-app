import { describe, expect, it } from "vitest";
import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import { computeRuleInsights, type RuleInsightsInput } from "@/pages/Dashboard/Programming/ruleInsights";

// Giovedì 26/03/2026, 13:00 a Roma.
const NOW = new Date("2026-03-26T12:00:00.000Z");

const ACTIVITIES = [
    { id: "sede-x", name: "Comasina" },
    { id: "sede-y", name: "Varedo" }
];

function rule(input: Partial<LayoutRule> & { id: string }): LayoutRule {
    return {
        tenant_id: "tenant-1",
        name: input.id,
        rule_type: "layout",
        target_type: "activity_group",
        target_id: "system-all",
        target_group: null,
        applyToAll: false,
        activityIds: [],
        groupIds: [],
        visibility_mode: "hide",
        priority: 10,
        priority_level: "medium",
        display_order: 0,
        enabled: true,
        time_mode: "always",
        days_of_week: null,
        time_from: null,
        time_to: null,
        start_at: null,
        end_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        layout: { style_id: "style-1", catalog_id: "catalog-1" },
        ...input
    } as LayoutRule;
}

function insightsFor(rules: LayoutRule[], overrides: Partial<RuleInsightsInput> = {}) {
    return computeRuleInsights({
        rules,
        activities: ACTIVITIES,
        activityIdsByGroupId: {},
        groupNameById: new Map(),
        filterActivityId: null,
        now: NOW,
        ruleName: r => r.name ?? r.id,
        ...overrides
    });
}

describe("computeRuleInsights — «Adesso» e «Sovrascritta da» come il resolver", () => {
    it("mucchio 2/2: la finestra più specifica vince anche con priorità peggiore", () => {
        const always = rule({ id: "sempre", activityIds: ["sede-x"], priority: 1 });
        const lunch = rule({
            id: "pranzo",
            activityIds: ["sede-x"],
            priority: 30,
            time_mode: "window",
            time_from: "12:00",
            time_to: "15:00"
        });

        const insights = insightsFor([always, lunch]);

        expect(insights.get("pranzo")?.isOverridden).toBe(false);
        expect(insights.get("sempre")).toMatchObject({
            isActiveNow: true,
            isOverridden: true,
            overriddenById: "pranzo",
            overriddenByName: "pranzo"
        });
    });

    it("mucchio 2/3: col filtro sede la competizione è quella della sede filtrata", () => {
        const all = rule({ id: "tutte", applyToAll: true });
        const onlyY = rule({ id: "solo-y", activityIds: ["sede-y"] });

        const onY = insightsFor([all, onlyY], { filterActivityId: "sede-y" });
        expect(onY.get("tutte")).toMatchObject({ isOverridden: true, overriddenById: "solo-y" });
        expect(onY.get("tutte")?.excludedActivityNames).toEqual(["Varedo"]);

        const onX = insightsFor([all, onlyY], { filterActivityId: "sede-x" });
        expect(onX.get("tutte")?.isOverridden).toBe(false);
        expect(onX.get("tutte")?.excludedActivityNames).toBeUndefined();

        // Senza filtro: vince in Comasina, quindi non è sovrascritta; perde a Varedo.
        const everywhere = insightsFor([all, onlyY]);
        expect(everywhere.get("tutte")?.isOverridden).toBe(false);
        expect(everywhere.get("tutte")?.excludedActivityNames).toEqual(["Varedo"]);
    });

    it("days_of_week vuoto: fuori da «Adesso» (staging aaa845cf)", () => {
        const noDays = rule({
            id: "aaa845cf",
            rule_type: "featured",
            activityIds: ["sede-x"],
            time_mode: "window",
            days_of_week: [],
            time_from: "11:00",
            time_to: "15:00"
        });

        expect(insightsFor([noDays]).get("aaa845cf")?.isActiveNow).toBe(false);
    });

    it("una regola menù senza catalogo non sovrascrive nessuno", () => {
        const empty = rule({ id: "senza-catalogo", activityIds: ["sede-x"], layout: { style_id: null, catalog_id: null } });
        const global = rule({ id: "globale", applyToAll: true });

        const insights = insightsFor([empty, global], { activities: [ACTIVITIES[0]] });

        expect(insights.get("globale")?.isOverridden).toBe(false);
        expect(insights.get("senza-catalogo")?.isOverridden).toBe(false);
    });

    it("le colonne legacy target_type/target_id non contano più (come il resolver)", () => {
        const legacy = rule({ id: "legacy", target_type: "activity", target_id: "sede-x" });
        const global = rule({ id: "globale", applyToAll: true });

        const insights = insightsFor([legacy, global], { activities: [ACTIVITIES[0]] });

        expect(insights.get("globale")?.isOverridden).toBe(false);
    });
});
