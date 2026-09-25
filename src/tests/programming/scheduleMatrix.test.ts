import { describe, expect, it } from "vitest";
import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import { romeInstantAt } from "@/utils/romeInstant";
import {
    buildScheduleMatrix,
    describeBand,
    describeDiagnosis,
    describeManual,
    describeWinner,
    type ScheduleMatrixInput
} from "@/utils/scheduleMatrix";

// Giovedì 26/03/2026 alle 13:00 di Roma.
const THURSDAY = { year: 2026, month: 2, day: 26 };
const AT_13 = romeInstantAt(THURSDAY, 13 * 60);

const ACTIVITIES = [
    { id: "garbagnate", name: "Garbagnate", status: "active" as const },
    { id: "comasina", name: "Comasina", status: "active" as const },
    { id: "baranzate", name: "Baranzate", status: "inactive" as const }
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
        layout: { style_id: "style-1", catalog_id: "catalogo-completo" },
        price_overrides: [],
        visibility_overrides: [],
        featured_contents: [],
        ...input
    } as LayoutRule;
}

const price = (n: number) => Array.from({ length: n }, () => ({})) as LayoutRule["price_overrides"];

function build(rules: LayoutRule[], overrides: Partial<ScheduleMatrixInput<LayoutRule>> = {}) {
    return buildScheduleMatrix({
        rules,
        activities: ACTIVITIES,
        activityIdsByGroupId: {},
        manualCounts: { garbagnate: 0, comasina: 3, baranzate: 0 },
        filterActivityId: null,
        instant: AT_13,
        subscriptionInactive: false,
        ...overrides
    });
}

const row = (m: ReturnType<typeof build>, id: string) => m.rows.find(r => r.activityId === id)!;

describe("buildScheduleMatrix — una riga per sede, una cella per strato", () => {
    it("chi vince in ogni cella è quello della competizione (resolveCompetition)", () => {
        const all = rule({ id: "principale", applyToAll: true });
        const colazioni = rule({ id: "colazioni", activityIds: ["comasina"], layout: { style_id: "s", catalog_id: "colazioni" } });
        const happy = rule({ id: "happy", rule_type: "price", applyToAll: true, price_overrides: price(2) });

        const m = build([all, colazioni, happy]);

        expect(m.rows.map(r => r.activityId)).toEqual(["garbagnate", "comasina", "baranzate"]);
        expect(row(m, "garbagnate").cells.layout).toMatchObject({ kind: "winner", rule: { id: "principale" } });
        expect(row(m, "comasina").cells.layout).toMatchObject({ kind: "winner", rule: { id: "colazioni" } });
        expect(row(m, "comasina").cells.price).toMatchObject({ kind: "winner", rule: { id: "happy" } });
        expect(row(m, "baranzate").suspended).toBe(true);
        expect(row(m, "baranzate").cells.layout).toMatchObject({ kind: "winner", rule: { id: "principale" } });
    });

    it("il gruppo raggiunge le sue sedi", () => {
        const nord = rule({ id: "nord", rule_type: "featured", groupIds: ["g-nord"] });
        const m = build([nord], { activityIdsByGroupId: { "g-nord": ["comasina"] } });
        expect(row(m, "comasina").cells.featured).toMatchObject({ kind: "winner", rule: { id: "nord" } });
        expect(row(m, "garbagnate").cells.featured).toEqual({ kind: "empty", diagnosis: { kind: "none", count: 0 } });
    });

    it("il cursore cambia chi vince: fuori dalla fascia la cella dice perché è vuota", () => {
        const happy = rule({ id: "happy", rule_type: "price", applyToAll: true, time_mode: "window", time_from: "18:00", time_to: "20:00", price_overrides: price(2) });
        expect(row(build([happy]), "garbagnate").cells.price).toEqual({ kind: "empty", diagnosis: { kind: "outOfWindow", count: 1 } });
        const at19 = build([happy], { instant: romeInstantAt(THURSDAY, 19 * 60) });
        expect(row(at19, "garbagnate").cells.price).toMatchObject({ kind: "winner", rule: { id: "happy" } });
    });

    it("diagnosi: bozza, poi fuori fascia, poi disabilitata, poi scaduta, poi nessuna", () => {
        const draft = rule({ id: "bozza", enabled: false, applyToAll: true, layout: { style_id: "s", catalog_id: null } });
        const later = rule({ id: "sera", applyToAll: true, time_mode: "window", time_from: "19:00", time_to: "23:00" });
        const off = rule({ id: "spenta", enabled: false, applyToAll: true });
        const expired = rule({ id: "scaduta", applyToAll: true, time_mode: "window", start_at: "2025-11-01T00:00:00Z", end_at: "2025-11-30T00:00:00Z" });
        const expired2 = rule({ ...expired, id: "scaduta-2" });

        const cell = (rules: LayoutRule[]) => row(build(rules), "garbagnate").cells.layout;
        expect(cell([draft, later, off, expired])).toEqual({ kind: "empty", diagnosis: { kind: "draft", count: 1 } });
        expect(cell([later, off, expired])).toEqual({ kind: "empty", diagnosis: { kind: "outOfWindow", count: 1 } });
        expect(cell([off, expired])).toEqual({ kind: "empty", diagnosis: { kind: "disabled", count: 1 } });
        expect(cell([expired, expired2])).toEqual({ kind: "empty", diagnosis: { kind: "expired", count: 2 } });
        expect(cell([])).toEqual({ kind: "empty", diagnosis: { kind: "none", count: 0 } });
    });

    it("una regola menù accesa senza catalogo non vince: la cella la dice bozza", () => {
        const noCatalog = rule({ id: "estivo", activityIds: ["garbagnate"], layout: { style_id: "s", catalog_id: null } });
        expect(row(build([noCatalog]), "garbagnate").cells.layout).toEqual({ kind: "empty", diagnosis: { kind: "draft", count: 1 } });
    });

    it("le regole di altre sedi non entrano nella diagnosi", () => {
        const elsewhere = rule({ id: "altrove", activityIds: ["comasina"], enabled: false });
        expect(row(build([elsewhere]), "garbagnate").cells.layout).toEqual({ kind: "empty", diagnosis: { kind: "none", count: 0 } });
    });

    it("«A mano» è il conteggio della sede; senza conteggio è null", () => {
        const m = build([]);
        expect(row(m, "comasina").manualCount).toBe(3);
        expect(row(build([], { manualCounts: null }), "comasina").manualCount).toBeNull();
    });

    it("col filtro sede c'è una riga sola", () => {
        const m = build([], { filterActivityId: "comasina" });
        expect(m.rows.map(r => r.activityId)).toEqual(["comasina"]);
        expect(m.band).toMatchObject({ total: 1 });
    });
});

describe("la banda: quante sedi mostrano un menù, e quante hanno modifiche a mano", () => {
    it("le sospese contano nel totale, non fra quelle che mostrano", () => {
        const all = rule({ id: "principale", applyToAll: true });
        expect(build([all]).band).toEqual({ total: 3, showing: 2, withManual: 1, subscriptionInactive: false });
    });

    it("una sede senza menù non mostra niente", () => {
        const onlyComasina = rule({ id: "colazioni", activityIds: ["comasina"] });
        expect(build([onlyComasina]).band).toMatchObject({ total: 3, showing: 1 });
    });

    it("con l'abbonamento non attivo nessuna sede mostra un menù", () => {
        const all = rule({ id: "principale", applyToAll: true });
        expect(build([all], { subscriptionInactive: true }).band).toMatchObject({ showing: 0, subscriptionInactive: true });
    });

    it("le modifiche a mano delle sospese non contano", () => {
        const m = build([], { manualCounts: { garbagnate: 0, comasina: 0, baranzate: 4 } });
        expect(m.band.withManual).toBe(0);
    });
});

describe("i testi", () => {
    it("la banda al plurale, come nel mockup", () => {
        const all = rule({ id: "principale", applyToAll: true });
        const m = build([all]);
        expect(describeBand(m, () => "Catalogo Completo")).toEqual({
            headline: "2 sedi su 3 stanno mostrando un menù",
            manual: "1 ha modifiche a mano in corso, che vincono sulle regole."
        });
        const one = build([rule({ id: "c", activityIds: ["comasina"] })], { manualCounts: { garbagnate: 1, comasina: 2, baranzate: 0 } });
        expect(describeBand(one, () => "Colazioni")).toEqual({
            headline: "1 sede su 3 sta mostrando un menù",
            manual: "2 hanno modifiche a mano in corso, che vincono sulle regole."
        });
        expect(describeBand(build([]), () => undefined).headline).toBe("Nessuna sede su 3 sta mostrando un menù");
        expect(describeBand(build([], { manualCounts: { garbagnate: 0, comasina: 0, baranzate: 0 } }), () => undefined).manual).toBeNull();
    });

    it("la banda al singolare con una riga sola", () => {
        const colazioni = rule({ id: "colazioni", activityIds: ["comasina"], layout: { style_id: "s", catalog_id: "colazioni" } });
        const m = build([colazioni], { filterActivityId: "comasina" });
        expect(describeBand(m, id => (id === "colazioni" ? "Colazioni" : undefined))).toEqual({
            headline: "Comasina sta mostrando Colazioni",
            manual: "Ha modifiche a mano in corso, che vincono sulle regole."
        });
        expect(describeBand(build([], { filterActivityId: "garbagnate" }), () => undefined)).toEqual({
            headline: "Garbagnate non sta mostrando un menù",
            manual: null
        });
        expect(describeBand(build([colazioni], { filterActivityId: "baranzate" }), () => undefined).headline).toBe(
            "Baranzate è sospesa: non mostra un menù"
        );
    });

    it("con l'abbonamento non attivo la banda lo dice", () => {
        const m = build([rule({ id: "p", applyToAll: true })], { subscriptionInactive: true });
        expect(describeBand(m, () => "x").headline).toBe("Nessuna sede mostra un menù: l'abbonamento non è attivo.");
    });

    it("la diagnosi, singolare e plurale; «adesso» solo all'ora di adesso", () => {
        expect(describeDiagnosis({ kind: "draft", count: 1 }, true)).toBe("1 bozza, non attiva");
        expect(describeDiagnosis({ kind: "draft", count: 2 }, true)).toBe("2 bozze, non attive");
        expect(describeDiagnosis({ kind: "outOfWindow", count: 1 }, true)).toBe("1 regola, fuori fascia adesso");
        expect(describeDiagnosis({ kind: "outOfWindow", count: 2 }, false)).toBe("2 regole, fuori fascia a quest'ora");
        expect(describeDiagnosis({ kind: "disabled", count: 1 }, true)).toBe("1 regola disabilitata");
        expect(describeDiagnosis({ kind: "expired", count: 2 }, true)).toBe("2 regole scadute");
        expect(describeDiagnosis({ kind: "none", count: 0 }, true)).toBe("nessuna regola");
    });

    it("«A mano»: quante, e che hanno l'ultima parola", () => {
        expect(describeManual(3)).toEqual({ primary: "3 modifiche", secondary: "hanno l'ultima parola" });
        expect(describeManual(1)).toEqual({ primary: "1 modifica", secondary: "ha l'ultima parola" });
        expect(describeManual(0)).toEqual({ primary: null, secondary: "nessuna" });
        expect(describeManual(null)).toEqual({ primary: null, secondary: "non caricate" });
    });

    it("la cella che vince: menù col catalogo sopra e la regola sotto, gli altri la regola e cosa fa", () => {
        const menu = rule({ id: "principale", name: "Menù principale" });
        expect(describeWinner(menu, "Catalogo Completo")).toEqual({ primary: "Catalogo Completo", secondary: "Menù principale" });
        const happy = rule({ id: "h", name: "Happy hour", rule_type: "price", price_overrides: price(2) });
        expect(describeWinner(happy)).toEqual({ primary: "Happy hour", secondary: "cambia 2 prezzi" });
        const coppia = rule({
            id: "c",
            name: "Menu di coppia",
            rule_type: "featured",
            featured_contents: [
                { featured_content_id: "f1", slot: "before_catalog", sort_order: 0, featured_content_title: "Menu coppia" },
                { featured_content_id: "f2", slot: "after_catalog", sort_order: 0, featured_content_title: "2 portate" }
            ]
        });
        expect(describeWinner(coppia)).toEqual({ primary: "Menu di coppia", secondary: "Menu coppia · 2 portate" });
    });
});
