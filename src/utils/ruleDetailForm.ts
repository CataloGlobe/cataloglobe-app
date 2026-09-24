import type {
    LayoutRule,
    LayoutRuleOption,
    LayoutTimeMode,
    RuleType,
    VisibilityMode
} from "@/services/supabase/layoutScheduling";
import { ruleTypeLabel } from "@/pages/Dashboard/Programming/ruleTypeLabel";
import { parseDecimalPrice } from "@/utils/priceParser";
import { isStartDateInPast } from "@/utils/ruleStartDate";

/**
 * Il form del dettaglio regola, uno per i quattro tipi (P8, §50.1 d): prima
 * c'erano due pagine gemelle (`ProgrammingRuleDetail`, `FeaturedRuleDetail`)
 * con nove validazioni scritte due volte. Qui ci sono la forma del form, la
 * sua lettura dalla regola salvata e le regole che decidono se si salva.
 * Niente React, niente rete: si prova coi test (`ruleDetailForm.test.ts`).
 */

export type TargetMode = "all" | "activities" | "groups";

export type FeaturedContentItem = {
    featuredContentId: string;
    slot: "before_catalog" | "after_catalog";
    sortOrder: number;
};

export type PriceOverrideDraft = {
    overridePrice: string;
    showOriginalPrice: boolean;
    valueOverrides?: Record<string, { overridePrice: string; showOriginalPrice: boolean }>;
};

export type RuleDetailForm = {
    name: string;
    ruleType: RuleType;
    targetMode: TargetMode;
    activityIds: string[];
    groupIds: string[];
    /** Menù e stile. */
    catalogId: string;
    styleId: string;
    /** Prezzi e disponibilità. */
    selectedProductIds: string[];
    productOverrides: Record<string, PriceOverrideDraft>;
    visibilityProductModes: Record<string, VisibilityMode>;
    /** In evidenza. */
    featuredContents: FeaturedContentItem[];
    enabled: boolean;
    alwaysActive: boolean;
    timeMode: LayoutTimeMode;
    startAt: string;
    endAt: string;
    daysOfWeek: string[];
    timeFrom: string;
    timeTo: string;
};

/** La parola del vertical per «prodotto» (`useVerticalConfig`). */
export type ProductLabels = { productLabel: string; productLabelPlural: string };
const DEFAULT_PRODUCT_LABELS: ProductLabels = { productLabel: "Prodotto", productLabelPlural: "Prodotti" };

/** «i prodotti», «gli articoli»: l'articolo plurale maschile davanti alla parola. */
export function withPluralArticle(word: string): string {
    return /^([aeiouhxyz]|s[^aeiou]|gn|ps|pn)/i.test(word) ? `gli ${word}` : `i ${word}`;
}

/** I campi che possono avere un errore; l'ordine è quello in cui si leggono. */
export const RULE_FORM_FIELDS = ["name", "timeFrom", "timeTo", "when", "startAt", "endAt", "prices"] as const;
export type RuleFormField = (typeof RULE_FORM_FIELDS)[number];
export type RuleFormErrors = Partial<Record<RuleFormField, string>>;

function toLocalDateString(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Oggi, come `YYYY-MM-DD` locale: il formato dei campi data. */
export function todayLocal(now: Date = new Date()): string {
    return toLocalDateString(now);
}

export function buildRuleDetailForm(
    rule: LayoutRule,
    activityById: Map<string, Pick<LayoutRuleOption, "name">>,
    catalogLabel: string
): RuleDetailForm {
    const productOverrides: RuleDetailForm["productOverrides"] = {};
    const visibilityProductModes: RuleDetailForm["visibilityProductModes"] = {};
    const selectedProductIds: string[] = [];

    if (rule.rule_type === "price") {
        for (const override of rule.price_overrides) {
            if (!selectedProductIds.includes(override.product_id)) selectedProductIds.push(override.product_id);
            if (override.option_value_id) {
                const existing = productOverrides[override.product_id] ?? { overridePrice: "", showOriginalPrice: false };
                productOverrides[override.product_id] = {
                    ...existing,
                    valueOverrides: {
                        ...existing.valueOverrides,
                        [override.option_value_id]: {
                            overridePrice: String(override.override_price),
                            showOriginalPrice: override.show_original_price
                        }
                    }
                };
            } else {
                productOverrides[override.product_id] = {
                    overridePrice: String(override.override_price ?? ""),
                    showOriginalPrice: override.show_original_price,
                    valueOverrides: productOverrides[override.product_id]?.valueOverrides
                };
            }
        }
    }

    if (rule.rule_type === "visibility") {
        for (const product of rule.visibility_overrides) {
            selectedProductIds.push(product.product_id);
            visibilityProductModes[product.product_id] = product.mode;
        }
    }

    const targetMode: TargetMode = rule.applyToAll
        ? "all"
        : rule.groupIds.length > 0
          ? "groups"
          : rule.activityIds.length > 0
            ? "activities"
            : rule.target_type === "activity_group"
              ? "groups"
              : "activities";

    const targetLabel =
        targetMode === "all"
            ? "tutte le sedi"
            : targetMode === "activities" && rule.activityIds.length > 0
              ? (activityById.get(rule.activityIds[0])?.name ?? rule.activityIds[0])
              : targetMode === "groups" && rule.groupIds.length > 0
                ? (rule.target_group?.name ?? rule.groupIds[0])
                : "nessuna sede";

    return {
        name: (rule.name ?? `${ruleTypeLabel(rule.rule_type, catalogLabel)} · ${targetLabel}`).trim(),
        ruleType: rule.rule_type,
        targetMode,
        activityIds: rule.activityIds ?? [],
        groupIds: rule.groupIds ?? [],
        catalogId: rule.layout?.catalog_id ?? "",
        styleId: rule.layout?.style_id ?? "",
        selectedProductIds,
        productOverrides,
        visibilityProductModes,
        featuredContents: (rule.featured_contents ?? []).map(fc => ({
            featuredContentId: fc.featured_content_id,
            slot: fc.slot,
            sortOrder: fc.sort_order
        })),
        enabled: rule.enabled,
        alwaysActive: rule.time_mode === "always",
        timeMode: rule.time_mode,
        startAt: rule.start_at ? toLocalDateString(new Date(rule.start_at)) : "",
        endAt: rule.end_at ? toLocalDateString(new Date(rule.end_at)) : "",
        daysOfWeek: (rule.days_of_week ?? []).map(day => String(day)),
        timeFrom: rule.time_from?.slice(0, 5) ?? "",
        timeTo: rule.time_to?.slice(0, 5) ?? ""
    };
}

/** Un prezzo per prodotto, o uno per formato se il prodotto ne ha. */
function hasInvalidPrice(form: RuleDetailForm, products: Array<Pick<LayoutRuleOption, "id" | "format_values">>): boolean {
    return form.selectedProductIds.some(productId => {
        const formats = products.find(p => p.id === productId)?.format_values ?? [];
        const draft = form.productOverrides[productId];
        const prices =
            formats.length > 0
                ? formats.map(fv => draft?.valueOverrides?.[fv.id]?.overridePrice ?? "")
                : [draft?.overridePrice ?? ""];
        return prices.some(value => {
            const price = parseDecimalPrice(value);
            return Number.isNaN(price) || price <= 0;
        });
    });
}

/**
 * Cosa impedisce di salvare, campo per campo. L'inizio nel passato è un
 * errore solo se la data è scelta adesso: una regola già partita, con la
 * data salvata (`savedStartAt`), resta salvabile (`isStartDateInPast`, PR
 * #140). I campi mancanti non sono errori: la regola si salva come bozza
 * (`missingDraftFields`).
 */
export function validateRuleForm(
    form: RuleDetailForm,
    {
        today,
        products,
        labels = DEFAULT_PRODUCT_LABELS,
        savedStartAt = ""
    }: {
        today: string;
        products: Array<Pick<LayoutRuleOption, "id" | "format_values">>;
        labels?: ProductLabels;
        /** La data di inizio salvata ("" per una regola mai salvata con un inizio). */
        savedStartAt?: string;
    }
): RuleFormErrors {
    const errors: RuleFormErrors = {};
    const set = (field: RuleFormField, message: string) => {
        if (!errors[field]) errors[field] = message;
    };

    if (!form.name.trim()) set("name", "Scrivi un nome.");

    const hasPeriod = Boolean(form.startAt || form.endAt);
    if (form.timeMode === "window") {
        if (Boolean(form.timeFrom) !== Boolean(form.timeTo)) {
            if (form.timeFrom) set("timeTo", "Manca l'ora di fine.");
            else set("timeFrom", "Manca l'ora di inizio.");
        } else if (!hasPeriod && form.daysOfWeek.length === 0 && !(form.timeFrom && form.timeTo)) {
            set("when", "Scegli un periodo, delle ore o dei giorni, oppure accendi «Sempre attiva».");
        }
        if (hasPeriod && !form.startAt) set("startAt", "Manca la data di inizio.");
        if (hasPeriod && !form.endAt) set("endAt", "Manca la data di fine.");
    }

    if (isStartDateInPast(form.startAt, savedStartAt, today)) set("startAt", "La data di inizio è già passata.");
    if (form.endAt) {
        if (form.endAt < today) set("endAt", "La data di fine è già passata.");
        else if (form.startAt && form.endAt < form.startAt) set("endAt", "La fine viene prima dell'inizio.");
    }
    if (form.timeFrom && form.timeTo && form.timeTo <= form.timeFrom) {
        set("timeTo", "L'ora di fine viene prima dell'inizio.");
    }

    if (form.ruleType === "price" && hasInvalidPrice(form, products)) {
        set("prices", `Scrivi un prezzo maggiore di zero per ogni ${labels.productLabel.toLowerCase()}.`);
    }

    return errors;
}

/** Il primo campo con un errore, nell'ordine dei campi, o null. */
export function firstRuleFormError(errors: RuleFormErrors): RuleFormField | null {
    return RULE_FORM_FIELDS.find(field => errors[field]) ?? null;
}

/** Cosa manca perché la regola sia completa: con qualcosa qui si salva spenta, come bozza. */
export function missingDraftFields(
    form: RuleDetailForm,
    catalogLabel: string,
    labels: ProductLabels = DEFAULT_PRODUCT_LABELS
): string[] {
    const missing: string[] = [];
    if (form.targetMode === "activities" && form.activityIds.length === 0) missing.push("le sedi");
    if (form.targetMode === "groups" && form.groupIds.length === 0) missing.push("i gruppi di sedi");
    if (form.ruleType === "layout") {
        if (!form.catalogId) missing.push(`il ${catalogLabel.toLowerCase()}`);
        if (!form.styleId) missing.push("lo stile");
    }
    if ((form.ruleType === "price" || form.ruleType === "visibility") && form.selectedProductIds.length === 0) {
        missing.push(withPluralArticle(labels.productLabelPlural.toLowerCase()));
    }
    if (form.ruleType === "featured" && form.featuredContents.length === 0) missing.push("i contenuti");
    return missing;
}
