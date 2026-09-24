import { describe, expect, it } from "vitest";
import {
    buildRuleDetailForm,
    firstRuleFormError,
    missingDraftFields,
    validateRuleForm,
    withPluralArticle,
    type RuleDetailForm
} from "@/utils/ruleDetailForm";
import type { LayoutRule, LayoutRuleOption } from "@/services/supabase/layoutScheduling";

const TODAY = "2026-09-23";

function makeRule(overrides: Partial<LayoutRule> = {}): LayoutRule {
    return {
        id: "rule-1",
        tenant_id: "tenant-1",
        name: "Pranzo",
        rule_type: "layout",
        target_type: "activity",
        target_id: "sede-1",
        target_group: null,
        applyToAll: false,
        activityIds: ["sede-1"],
        groupIds: [],
        visibility_mode: "hide",
        priority: 0,
        priority_level: "normal",
        display_order: 0,
        enabled: true,
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

function makeForm(overrides: Partial<RuleDetailForm> = {}): RuleDetailForm {
    return {
        name: "Pranzo",
        ruleType: "layout",
        targetMode: "activities",
        activityIds: ["sede-1"],
        groupIds: [],
        catalogId: "catalog-1",
        styleId: "style-1",
        selectedProductIds: [],
        productOverrides: {},
        visibilityProductModes: {},
        featuredContents: [],
        enabled: true,
        alwaysActive: false,
        timeMode: "window",
        startAt: "",
        endAt: "",
        daysOfWeek: ["1"],
        timeFrom: "",
        timeTo: "",
        ...overrides
    };
}

const NO_PRODUCTS: LayoutRuleOption[] = [];
const validate = (form: RuleDetailForm, products = NO_PRODUCTS) => validateRuleForm(form, { today: TODAY, products });

describe("validateRuleForm", () => {
    it("una regola completa non ha errori", () => {
        expect(validate(makeForm())).toEqual({});
        expect(validate(makeForm({ timeMode: "always", alwaysActive: true, daysOfWeek: [] }))).toEqual({});
    });

    it("il nome è obbligatorio", () => {
        expect(validate(makeForm({ name: "   " }))).toMatchObject({ name: "Scrivi un nome." });
    });

    it("un'ora sola: l'errore va sul campo che manca", () => {
        expect(validate(makeForm({ timeFrom: "11:00" }))).toMatchObject({ timeTo: "Manca l'ora di fine." });
        expect(validate(makeForm({ timeTo: "15:00" }))).toMatchObject({ timeFrom: "Manca l'ora di inizio." });
    });

    it("una finestra vuota chiede un periodo, delle ore o dei giorni", () => {
        expect(validate(makeForm({ daysOfWeek: [] }))).toMatchObject({
            when: "Scegli un periodo, delle ore o dei giorni, oppure accendi «Sempre attiva»."
        });
    });

    it("un periodo ha inizio e fine", () => {
        expect(validate(makeForm({ endAt: "2026-10-01" }))).toMatchObject({ startAt: "Manca la data di inizio." });
        expect(validate(makeForm({ startAt: "2026-10-01" }))).toMatchObject({ endAt: "Manca la data di fine." });
    });

    it("le date già passate non si salvano", () => {
        expect(validate(makeForm({ startAt: "2026-09-22", endAt: "2026-10-01" }))).toMatchObject({
            startAt: "La data di inizio è già passata."
        });
        expect(validate(makeForm({ startAt: "2026-09-23", endAt: "2026-09-22" }))).toMatchObject({
            endAt: "La data di fine è già passata."
        });
    });

    it("una regola già partita si salva: l'inizio salvato può restare nel passato (PR #140)", () => {
        const started = makeForm({ startAt: "2026-09-01", endAt: "2026-12-31" });
        const opts = { today: TODAY, products: NO_PRODUCTS, savedStartAt: "2026-09-01" };
        expect(validateRuleForm(started, opts).startAt).toBeUndefined();
        // Spostata a un altro giorno passato, torna un errore.
        expect(validateRuleForm({ ...started, startAt: "2026-08-15" }, opts).startAt).toBe("La data di inizio è già passata.");
        // Senza inizio salvato (regola nuova), un inizio passato blocca.
        expect(validate(started).startAt).toBe("La data di inizio è già passata.");
    });

    it("la fine non viene prima dell'inizio, né per le date né per le ore", () => {
        expect(validate(makeForm({ startAt: "2026-10-10", endAt: "2026-10-01" }))).toMatchObject({
            endAt: "La fine viene prima dell'inizio."
        });
        expect(validate(makeForm({ timeFrom: "15:00", timeTo: "11:00" }))).toMatchObject({
            timeTo: "L'ora di fine viene prima dell'inizio."
        });
        expect(validate(makeForm({ timeFrom: "11:00", timeTo: "11:00" })).timeTo).toBeDefined();
    });

    it("prezzi: ogni prodotto (e ogni formato) ha un prezzo maggiore di zero", () => {
        const products = [
            { id: "p1", name: "Spritz", tenant_id: "t" },
            { id: "p2", name: "Pizza", tenant_id: "t", format_values: [{ id: "f1", name: "Piccola" }, { id: "f2", name: "Grande" }] }
        ] as LayoutRuleOption[];
        const base = makeForm({ ruleType: "price", selectedProductIds: ["p1", "p2"] });
        const ok = {
            p1: { overridePrice: "5,50", showOriginalPrice: false },
            p2: {
                overridePrice: "",
                showOriginalPrice: false,
                valueOverrides: { f1: { overridePrice: "6", showOriginalPrice: false }, f2: { overridePrice: "9", showOriginalPrice: true } }
            }
        };
        expect(validate({ ...base, productOverrides: ok }, products)).toEqual({});
        expect(validate({ ...base, productOverrides: { ...ok, p1: { overridePrice: "0", showOriginalPrice: false } } }, products)).toMatchObject({
            prices: "Scrivi un prezzo maggiore di zero per ogni prodotto."
        });
        const missingFormat = { ...ok, p2: { ...ok.p2, valueOverrides: { f1: ok.p2.valueOverrides.f1 } } };
        expect(validate({ ...base, productOverrides: missingFormat }, products).prices).toBeDefined();
    });

    it("il primo errore segue l'ordine dei campi di oggi", () => {
        const errors = validate(makeForm({ name: "", startAt: "2026-10-10", endAt: "2026-10-01" }));
        expect(firstRuleFormError(errors)).toBe("name");
        expect(firstRuleFormError({ endAt: "x", timeTo: "y" })).toBe("timeTo");
        expect(firstRuleFormError({})).toBeNull();
    });
});

describe("la parola per «prodotti» viene dal vertical", () => {
    const labels = { productLabel: "Articolo", productLabelPlural: "Articoli" };

    it("nel messaggio dei prezzi", () => {
        const form = makeForm({ ruleType: "price", selectedProductIds: ["p1"], productOverrides: { p1: { overridePrice: "", showOriginalPrice: false } } });
        expect(validateRuleForm(form, { today: TODAY, products: NO_PRODUCTS, labels }).prices).toBe(
            "Scrivi un prezzo maggiore di zero per ogni articolo."
        );
    });

    it("con l'articolo giusto", () => {
        expect(withPluralArticle("prodotti")).toBe("i prodotti");
        expect(withPluralArticle("articoli")).toBe("gli articoli");
        expect(withPluralArticle("servizi")).toBe("i servizi");
        expect(withPluralArticle("strumenti")).toBe("gli strumenti");
    });

    it("in quello che manca alla bozza", () => {
        expect(missingDraftFields(makeForm({ ruleType: "visibility" }), "Menù", labels)).toEqual(["gli articoli"]);
    });
});

describe("missingDraftFields", () => {
    it("dice solo quello che manca, per tipo", () => {
        expect(missingDraftFields(makeForm(), "Menù")).toEqual([]);
        expect(missingDraftFields(makeForm({ activityIds: [], catalogId: "" }), "Menù")).toEqual(["le sedi", "il menù"]);
        expect(missingDraftFields(makeForm({ targetMode: "groups", groupIds: [] }), "Menù")).toEqual(["i gruppi di sedi"]);
        expect(missingDraftFields(makeForm({ ruleType: "price" }), "Menù")).toEqual(["i prodotti"]);
        expect(missingDraftFields(makeForm({ ruleType: "visibility" }), "Menù")).toEqual(["i prodotti"]);
        expect(missingDraftFields(makeForm({ ruleType: "featured" }), "Menù")).toEqual(["i contenuti"]);
        expect(missingDraftFields(makeForm({ targetMode: "all", activityIds: [] }), "Menù")).toEqual([]);
    });
});

describe("buildRuleDetailForm", () => {
    const activityById = new Map([["sede-1", { id: "sede-1", name: "Centro", tenant_id: "t" }]]);

    it("legge periodo, giorni e ore come li mostra il form", () => {
        const form = buildRuleDetailForm(
            makeRule({ time_mode: "window", days_of_week: [1, 5], time_from: "11:00:00", time_to: "15:00:00" }),
            activityById,
            "Menù"
        );
        expect(form).toMatchObject({ timeMode: "window", alwaysActive: false, daysOfWeek: ["1", "5"], timeFrom: "11:00", timeTo: "15:00" });
    });

    it("prezzi per formato finiscono sotto il loro prodotto", () => {
        const form = buildRuleDetailForm(
            makeRule({
                rule_type: "price",
                price_overrides: [
                    { product_id: "p2", option_value_id: "f1", override_price: 6, show_original_price: true },
                    { product_id: "p1", option_value_id: null, override_price: 5.5, show_original_price: false }
                ] as LayoutRule["price_overrides"]
            }),
            activityById,
            "Menù"
        );
        expect(form.selectedProductIds).toEqual(["p2", "p1"]);
        expect(form.productOverrides.p2.valueOverrides?.f1).toEqual({ overridePrice: "6", showOriginalPrice: true });
        expect(form.productOverrides.p1.overridePrice).toBe("5.5");
    });

    it("in evidenza: contenuti e nome di ripiego", () => {
        const form = buildRuleDetailForm(
            makeRule({
                rule_type: "featured",
                name: null,
                featured_contents: [{ featured_content_id: "fc1", slot: "before_catalog", sort_order: 0 }] as LayoutRule["featured_contents"]
            }),
            activityById,
            "Menù"
        );
        expect(form.featuredContents).toEqual([{ featuredContentId: "fc1", slot: "before_catalog", sortOrder: 0 }]);
        expect(form.name).toBe("In evidenza · Centro");
    });
});
