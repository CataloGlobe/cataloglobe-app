import { describe, expect, it } from "vitest";
import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import { romeInstantAt } from "@/utils/romeInstant";
import { buildScheduleMatrix } from "@/utils/scheduleMatrix";
import { computeRuleInsights } from "@/utils/ruleInsights";
import {
    appearanceOf,
    buildAppearance,
    catalogStyleIds,
    describeCatalogSummary,
    describePlacement,
    describeStyleSaveWarning,
    describeStyleSummary,
    joinSeatNames,
    storyAppearance,
    type AppearanceInput
} from "@/utils/ruleAppearance";

/**
 * Contratto di `ruleAppearance.ts` (§50.13): dove e quando appare un menù,
 * uno stile, un contenuto in evidenza, una storia. La competizione è quella
 * della pagina pubblica (`resolveCompetition`): i casi 13 lo tengono contro
 * la matrice e «Sovrascritta da», che la usano già.
 */

// Giovedì 26/03/2026 alle 13:00 di Roma.
const THURSDAY = { year: 2026, month: 2, day: 26 };
const AT_13 = romeInstantAt(THURSDAY, 13 * 60);

const ACTIVITIES = [
    { id: "garbagnate", name: "Garbagnate", status: "active" },
    { id: "comasina", name: "Comasina", status: "active" },
    { id: "baranzate", name: "Baranzate", status: "inactive" }
];

function rule(input: Partial<LayoutRule> & { id: string }): LayoutRule {
    return {
        tenant_id: "tenant-1",
        name: input.id,
        rule_type: "layout",
        target_type: "activity",
        target_id: "",
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
        layout: { style_id: "base", catalog_id: "carta" },
        price_overrides: [],
        visibility_overrides: [],
        featured_contents: [],
        ...input
    } as LayoutRule;
}

const featured = (id: string, contents: Array<[string, "before_catalog" | "after_catalog"]>, input: Partial<LayoutRule> = {}) =>
    rule({
        id,
        rule_type: "featured",
        layout: null,
        featured_contents: contents.map(([featured_content_id, slot], i) => ({ featured_content_id, slot, sort_order: i })),
        ...input
    });

function index(rules: LayoutRule[], overrides: Partial<AppearanceInput> = {}) {
    return buildAppearance({
        rules,
        activities: ACTIVITIES,
        activityIdsByGroupId: {},
        instant: AT_13,
        subscriptionInactive: false,
        ...overrides
    });
}

const seat = (a: ReturnType<typeof appearanceOf>, id: string) => a.seats.find(s => s.activityId === id);

describe("ruleAppearance — dove e quando appare un menù, uno stile, un contenuto", () => {
    it("(1) vince adesso in una sede: in onda, e la sede è nominata", () => {
        const a = appearanceOf(index([rule({ id: "pranzo", activityIds: ["garbagnate"] })]), { kind: "catalog", id: "carta" });
        expect(a.summary).toBe("liveNow");
        expect(seat(a, "garbagnate")).toMatchObject({ reason: "live", rule: { id: "pranzo" } });
        expect(describeCatalogSummary(a)).toEqual({ label: "Attivo adesso in Garbagnate", tone: "success" });
    });

    it("(2) viva ma fuori fascia: assegnato, nessuna sede adesso", () => {
        const sera = rule({ id: "sera", activityIds: ["garbagnate", "comasina"], time_mode: "window", time_from: "19:00", time_to: "23:00" });
        const a = appearanceOf(index([sera]), { kind: "catalog", id: "carta" });
        expect(a.summary).toBe("assigned");
        expect(seat(a, "comasina")?.reason).toBe("outOfWindow");
        expect(describeCatalogSummary(a)).toEqual({ label: "Su 2 sedi, nessuna adesso", tone: "warning" });
    });

    it("(3) in finestra ma battuta da una più specifica: overridden, come «Sovrascritta da»", () => {
        const tutte = rule({ id: "tutte", applyToAll: true });
        const colazioni = rule({ id: "colazioni", activityIds: ["comasina"], layout: { style_id: "base", catalog_id: "colazioni" } });
        const i = index([tutte, colazioni]);
        const carta = appearanceOf(i, { kind: "catalog", id: "carta" });
        expect(seat(carta, "garbagnate")?.reason).toBe("live");
        expect(seat(carta, "comasina")).toMatchObject({ reason: "overridden", overriddenBy: { id: "colazioni" } });

        const insights = computeRuleInsights({
            rules: [tutte, colazioni],
            activities: ACTIVITIES,
            activityIdsByGroupId: {},
            groupNameById: new Map(),
            filterActivityId: "comasina",
            now: new Date(AT_13.epoch),
            ruleName: r => r.id
        });
        expect(insights.get("tutte")?.isOverridden).toBe(true);
        expect(insights.get("tutte")?.overriddenById).toBe("colazioni");
    });

    it("(4) sede sospesa: la regola vince, la sede non mostra niente", () => {
        const a = appearanceOf(index([rule({ id: "baranzate", activityIds: ["baranzate"] })]), { kind: "catalog", id: "carta" });
        expect(seat(a, "baranzate")?.reason).toBe("suspended");
        expect(a.summary).toBe("assigned");
    });

    it("(5) abbonamento non attivo: nessuna sede in onda", () => {
        const a = appearanceOf(index([rule({ id: "tutte", applyToAll: true })], { subscriptionInactive: true }), { kind: "catalog", id: "carta" });
        expect(a.seats.map(s => s.reason)).toEqual(["subscriptionInactive", "subscriptionInactive", "suspended"]);
        expect(a.summary).toBe("assigned");
    });

    it("(6) bozze: layout senza catalogo né stile, featured senza contenuti, portata zero", () => {
        const noStyle = rule({ id: "senza-stile", enabled: false, applyToAll: true, layout: { style_id: null, catalog_id: "carta" } });
        const emptyGroup = rule({ id: "gruppo-vuoto", groupIds: ["g-vuoto"] });
        const i = index([noStyle, emptyGroup], { activityIdsByGroupId: { "g-vuoto": [] } });
        const a = appearanceOf(i, { kind: "catalog", id: "carta" });
        expect(a.rules.map(e => [e.rule.id, e.status, e.isLive])).toEqual([
            ["senza-stile", "draft", false],
            ["gruppo-vuoto", "draft", false]
        ]);
        expect(seat(a, "garbagnate")?.reason).toBe("draft");
        expect(a.summary).toBe("stoppedOnly");

        const noContents = featured("vuota", [], { enabled: false, applyToAll: true });
        expect(index([noContents]).entries.get("vuota")).toMatchObject({ status: "draft", isLive: false });
    });

    it("(7) solo regole spente e scadute: ferme", () => {
        const off = rule({ id: "spenta", enabled: false, applyToAll: true });
        const expired = rule({ id: "scaduta", applyToAll: true, time_mode: "window", start_at: "2025-11-01T00:00:00Z", end_at: "2025-11-30T00:00:00Z" });
        const a = appearanceOf(index([off, expired]), { kind: "catalog", id: "carta" });
        expect(a.summary).toBe("stoppedOnly");
        expect(seat(a, "garbagnate")?.reason).toBe("disabled");
        expect(appearanceOf(index([expired]), { kind: "catalog", id: "carta" }).seats[0].reason).toBe("expired");
        expect(describeCatalogSummary(a)).toEqual({ label: "Nessuna regola attiva", tone: "neutral" });
        expect(describeStyleSummary(a)).toEqual({ label: "Nessuna regola attiva", tone: "neutral" });
    });

    it("(8) nessuna regola lo nomina: non assegnato", () => {
        const a = appearanceOf(index([rule({ id: "altro", applyToAll: true, layout: { style_id: "base", catalog_id: "altro" } })]), { kind: "catalog", id: "carta" });
        expect(a).toEqual({ summary: "unassigned", seats: [], rules: [] });
        expect(describeCatalogSummary(a).label).toBe("Non assegnato a nessuna sede");
        expect(describeStyleSummary(appearanceOf(index([]), { kind: "style", id: "base" })).label).toBe("Non utilizzato");
    });

    it("(9) raggiunto via gruppo e via «tutte le sedi»", () => {
        const nord = rule({ id: "nord", groupIds: ["g-nord"] });
        const a = appearanceOf(index([nord], { activityIdsByGroupId: { "g-nord": ["comasina"] } }), { kind: "catalog", id: "carta" });
        expect(a.seats.map(s => s.activityId)).toEqual(["comasina"]);
        const all = appearanceOf(index([rule({ id: "tutte", applyToAll: true })]), { kind: "catalog", id: "carta" });
        expect(all.seats.map(s => s.activityId)).toEqual(["garbagnate", "comasina", "baranzate"]);
        expect(describeCatalogSummary(all).label).toBe("Attivo adesso in 2 sedi");
    });

    it("(10) due regole vive con stili diversi: ogni stile nelle sue sedi; senza stile non assegna", () => {
        const g = rule({ id: "g", activityIds: ["garbagnate"], layout: { style_id: "estate", catalog_id: "carta" } });
        const c = rule({ id: "c", activityIds: ["comasina"], layout: { style_id: "sera", catalog_id: "carta" } });
        const none = rule({ id: "n", activityIds: ["baranzate"], layout: { style_id: null, catalog_id: "carta" } });
        const i = index([g, c, none]);
        expect(appearanceOf(i, { kind: "style", id: "estate" }).seats.map(s => [s.activityId, s.reason])).toEqual([["garbagnate", "live"]]);
        expect(appearanceOf(i, { kind: "style", id: "sera" }).seats.map(s => [s.activityId, s.reason])).toEqual([["comasina", "live"]]);
        expect(catalogStyleIds(appearanceOf(i, { kind: "catalog", id: "carta" }))).toEqual(["estate", "sera"]);
    });

    it("(10b) swatch del menù: se non è in onda, lo stile delle regole vive", () => {
        const sera = rule({ id: "sera", applyToAll: true, time_mode: "window", time_from: "19:00", time_to: "23:00", layout: { style_id: "notte", catalog_id: "carta" } });
        const off = rule({ id: "off", enabled: false, applyToAll: true, layout: { style_id: "vecchio", catalog_id: "carta" } });
        expect(catalogStyleIds(appearanceOf(index([sera, off]), { kind: "catalog", id: "carta" }))).toEqual(["notte"]);
        expect(catalogStyleIds(appearanceOf(index([off]), { kind: "catalog", id: "carta" }))).toEqual([]);
    });

    it("(11) in evidenza: slot giusto per regola, e «viva» non è «vince»", () => {
        const costa = featured("costa", [["autunno", "before_catalog"]], { activityIds: ["comasina"] });
        const porto = featured("porto", [["autunno", "after_catalog"], ["jazz", "after_catalog"]], { activityIds: ["comasina"], created_at: "2026-02-01T00:00:00Z" });
        const spenta = featured("spenta", [["natale", "before_catalog"]], { enabled: false, applyToAll: true });
        const i = index([costa, porto, spenta]);

        const autunno = appearanceOf(i, { kind: "featured", id: "autunno" });
        expect(autunno.rules.map(e => [e.rule.id, e.slot])).toEqual([["costa", "before_catalog"], ["porto", "after_catalog"]]);
        expect(seat(autunno, "comasina")).toMatchObject({ reason: "live", rule: { id: "costa" } });

        // «jazz» ha una regola viva che adesso perde: non è «nessuna regola li mostra».
        const jazz = appearanceOf(i, { kind: "featured", id: "jazz" });
        expect(seat(jazz, "comasina")).toMatchObject({ reason: "overridden", overriddenBy: { id: "costa" } });
        expect(jazz.summary).toBe("assigned");
        // «natale» esiste in una regola, spenta: nessuna regola viva lo mostra.
        expect(appearanceOf(i, { kind: "featured", id: "natale" }).summary).toBe("stoppedOnly");

        const name = (id: string) => ACTIVITIES.find(a => a.id === id)?.name;
        expect(describePlacement(autunno.rules[0], name)).toBe("sopra il menù · Comasina · sempre");
        const window = featured("aperitivo", [["jazz", "after_catalog"]], { applyToAll: true, time_mode: "window", time_from: "17:00:00", time_to: "20:00:00", days_of_week: [4] });
        expect(describePlacement(appearanceOf(index([window]), { kind: "featured", id: "jazz" }).rules[0], name)).toBe(
            "sotto il menù · tutte le sedi · Gio · 17:00–20:00"
        );
    });

    it("(12) senza un menù che vince: lo stile non è in onda, il contenuto in evidenza sì", () => {
        const sera = rule({ id: "sera", applyToAll: true, time_mode: "window", time_from: "19:00", time_to: "23:00", layout: { style_id: "notte", catalog_id: "carta" } });
        const promo = featured("promo", [["autunno", "before_catalog"]], { applyToAll: true });
        const i = index([sera, promo]);
        expect(seat(appearanceOf(i, { kind: "style", id: "notte" }), "garbagnate")?.reason).toBe("outOfWindow");
        expect(seat(appearanceOf(i, { kind: "featured", id: "autunno" }), "garbagnate")?.reason).toBe("live");
    });

    it("(13) parità con la matrice: in ogni sede il menù in onda è la cella che vince", () => {
        const rules = [
            rule({ id: "tutte", applyToAll: true }),
            rule({ id: "pranzo", activityIds: ["garbagnate"], time_mode: "window", time_from: "11:00", time_to: "15:00", layout: { style_id: "base", catalog_id: "pranzo" } }),
            rule({ id: "nord", groupIds: ["g-nord"], priority: 5, layout: { style_id: "base", catalog_id: "nord" } }),
            rule({ id: "sera", activityIds: ["comasina"], time_mode: "window", time_from: "19:00", time_to: "23:00", layout: { style_id: "base", catalog_id: "sera" } })
        ];
        const groups = { "g-nord": ["comasina", "baranzate"] };
        const matrix = buildScheduleMatrix({
            rules,
            activities: ACTIVITIES.map(a => ({ ...a, status: a.status as "active" | "inactive" })),
            activityIdsByGroupId: groups,
            manualCounts: null,
            filterActivityId: null,
            instant: AT_13,
            subscriptionInactive: false
        });
        const i = index(rules, { activityIdsByGroupId: groups });
        for (const row of matrix.rows) {
            const cell = row.cells.layout;
            const winnerCatalog = cell.kind === "winner" ? cell.rule.layout?.catalog_id : null;
            for (const catalog of ["carta", "pranzo", "nord", "sera"]) {
                const s = seat(appearanceOf(i, { kind: "catalog", id: catalog }), row.activityId);
                const onAir = s?.reason === "live" || (s?.reason === "suspended" && s.rule.id === (cell.kind === "winner" ? cell.rule.id : null));
                expect([row.activityId, catalog, onAir]).toEqual([row.activityId, catalog, winnerCatalog === catalog]);
            }
        }
    });

    it("(14) il giorno del cambio d'ora: l'istante di Roma decide la finestra", () => {
        // Domenica 29/03/2026: alle 02:00 gli orologi passano alle 03:00.
        const sunday = { year: 2026, month: 2, day: 29 };
        const mattina = rule({ id: "mattina", applyToAll: true, time_mode: "window", time_from: "03:00", time_to: "04:00" });
        const at0330 = index([mattina], { instant: romeInstantAt(sunday, 3 * 60 + 30) });
        expect(seat(appearanceOf(at0330, { kind: "catalog", id: "carta" }), "garbagnate")?.reason).toBe("live");
        const at0430 = index([mattina], { instant: romeInstantAt(sunday, 4 * 60 + 30) });
        expect(seat(appearanceOf(at0430, { kind: "catalog", id: "carta" }), "garbagnate")?.reason).toBe("outOfWindow");
    });

    it("(15) storie: niente regole, i cancelli di resolve-public-story", () => {
        expect(storyAppearance({ status: "draft", activity_id: null }, ACTIVITIES, false)).toEqual({ kind: "nowhere", reason: "draft" });
        expect(storyAppearance({ status: "published", activity_id: null }, ACTIVITIES, false)).toMatchObject({
            kind: "everywhere",
            seats: [{ id: "garbagnate" }, { id: "comasina" }]
        });
        expect(storyAppearance({ status: "published", activity_id: "comasina" }, ACTIVITIES, false)).toMatchObject({ kind: "oneSede", seat: { id: "comasina" } });
        expect(storyAppearance({ status: "published", activity_id: "baranzate" }, ACTIVITIES, false)).toEqual({
            kind: "nowhere",
            reason: "suspended",
            seatName: "Baranzate"
        });
        expect(storyAppearance({ status: "published", activity_id: null }, ACTIVITIES, true)).toEqual({ kind: "nowhere", reason: "subscriptionInactive" });
        expect(storyAppearance({ status: "published", activity_id: "sparita" }, ACTIVITIES, false)).toEqual({ kind: "nowhere", reason: "missingSede" });
    });

    it("l'avviso dello stile nomina le sedi, e tace senza regole vive", () => {
        const tutte = rule({ id: "tutte", applyToAll: true, layout: { style_id: "estate", catalog_id: "carta" } });
        expect(describeStyleSaveWarning(appearanceOf(index([tutte]), { kind: "style", id: "estate" }))).toBe(
            "Garbagnate e Comasina vedono le modifiche subito. Se serve, da Versioni torni alla versione di prima."
        );
        const sera = rule({ id: "sera", activityIds: ["comasina"], time_mode: "window", time_from: "19:00", time_to: "23:00", layout: { style_id: "notte", catalog_id: "carta" } });
        expect(describeStyleSaveWarning(appearanceOf(index([sera]), { kind: "style", id: "notte" }))).toBe(
            "Nessuna sede lo mostra adesso: le modifiche arrivano con le sue regole programmate, su Comasina. Se serve, da Versioni torni alla versione di prima."
        );
        const off = rule({ id: "off", enabled: false, applyToAll: true, layout: { style_id: "vecchio", catalog_id: "carta" } });
        expect(describeStyleSaveWarning(appearanceOf(index([off]), { kind: "style", id: "vecchio" }))).toBeNull();
        expect(joinSeatNames(["A", "B", "C", "D", "E", "F"])).toBe("A, B, C e altre 3 sedi");
    });
});
