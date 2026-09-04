import { describe, expect, it } from "vitest";
import { getToggleGuardResult } from "@/utils/ruleToggleGuards";
import type { LayoutRule } from "@/services/supabase/layoutScheduling";

/** Regola layout completa (target + catalogo + stile): non è una bozza. */
function makeRule(overrides: Partial<LayoutRule> = {}): LayoutRule {
    return {
        id: "rule-1",
        tenant_id: "tenant-1",
        name: "Regola di test",
        rule_type: "layout",
        target_type: "activity",
        target_id: "",
        target_group: null,
        applyToAll: true,
        activityIds: [],
        groupIds: [],
        visibility_mode: "visible",
        priority: 0,
        priority_level: "normal",
        display_order: 0,
        enabled: false,
        time_mode: "always",
        days_of_week: null,
        time_from: null,
        time_to: null,
        start_at: null,
        end_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        layout: { catalog_id: "catalog-1", style_id: "style-1" },
        price_overrides: [],
        visibility_overrides: [],
        featured_contents: [],
        ...overrides
    } as LayoutRule;
}

const PAST = "2020-01-01T23:59:59.000Z";
const FUTURE = "2999-01-01T23:59:59.000Z";

describe("getToggleGuardResult", () => {
    it("consente l'attivazione di una regola completa e non scaduta", () => {
        expect(getToggleGuardResult(makeRule())).toEqual({ canToggle: true });
    });

    it("blocca una regola scaduta", () => {
        const result = getToggleGuardResult(makeRule({ end_at: PAST }));
        expect(result.canToggle).toBe(false);
        expect(result.reason).toBe(
            "Questa regola è scaduta. Aggiorna la data di fine prima di riattivarla."
        );
    });

    it("non blocca una regola con data di fine futura", () => {
        expect(getToggleGuardResult(makeRule({ end_at: FUTURE }))).toEqual({ canToggle: true });
    });

    it("blocca una bozza incompleta (layout senza catalogo)", () => {
        const result = getToggleGuardResult(makeRule({ layout: { catalog_id: null, style_id: "style-1" } }));
        expect(result.canToggle).toBe(false);
        expect(result.reason).toBe("Completa i campi obbligatori prima di attivare la regola.");
    });

    it("blocca una bozza senza target", () => {
        const result = getToggleGuardResult(
            makeRule({ applyToAll: false, activityIds: [], groupIds: [] })
        );
        expect(result.canToggle).toBe(false);
        expect(result.reason).toBe("Completa i campi obbligatori prima di attivare la regola.");
    });

    it("dà precedenza al messaggio di scadenza su quello di bozza", () => {
        const result = getToggleGuardResult(
            makeRule({ end_at: PAST, layout: { catalog_id: null, style_id: null } })
        );
        expect(result.reason).toBe(
            "Questa regola è scaduta. Aggiorna la data di fine prima di riattivarla."
        );
    });
});
