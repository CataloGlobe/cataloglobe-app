import {
    applyVisibilityOverridesToCatalog,
    type ActivityProductOverrideRow,
    type ResolvedCatalog,
    type ResolvedProduct,
    type VisibilityOverrideRow
} from "@/services/supabase/resolveActivityCatalogs";
import type { VisibilityMode } from "@/services/supabase/scheduleResolver";
import { getDisplayPrice } from "@/utils/priceDisplay";

/**
 * «Cosa vedono i clienti» (§19, milestone 7): perché ogni prodotto del menù
 * di una sede è nello stato in cui il cliente lo trova adesso.
 *
 * Il resolver non dice chi ha cambiato cosa: restituisce solo il catalogo
 * finale. La provenienza si ricava qui, senza toccarlo: per sede vince al
 * più una regola per tipo, quindi bastano il catalogo base, l'uscita del
 * resolver (la verità, la stessa dell'Edge), le righe della regola di
 * disponibilità che vince, quelle della regola prezzi e le modifiche a mano.
 * Lo strato 2 si ricalcola con la funzione del resolver
 * (`applyVisibilityOverridesToCatalog`), non con una copia.
 * Parità col resolver: `src/tests/scheduling/catalogExplanation.contract.test.ts`.
 */

/** Come lo trova il cliente: lo vede, non lo vede, lo vede segnato «non disponibile». */
export type CustomerState = "visible" | "hidden" | "unavailable";

export type RuleRef = { id: string; name: string };

/** Una riga di `schedule_price_overrides` della regola prezzi che vince. */
export type PriceRuleRow = { product_id: string; option_value_id: string | null };

export type CatalogExplanationInput = {
    /** Il catalogo della regola menù che vince, prima di ogni strato. */
    base: ResolvedCatalog;
    /** L'uscita del resolver; `undefined` se non resta niente da mostrare. */
    final: ResolvedCatalog | undefined;
    visibilityRule: (RuleRef & { mode: VisibilityMode }) | null;
    visibilityRows: VisibilityOverrideRow[];
    priceRule: RuleRef | null;
    priceRows: PriceRuleRow[];
    /** Le modifiche a mano della sede (strato 4), per prodotto. */
    manual: Record<string, ActivityProductOverrideRow>;
};

export type ProductExplanation = {
    productId: string;
    name: string;
    categoryName: string;
    /** Adesso, per il cliente. */
    state: CustomerState;
    /** Quello che dicono le regole senza le modifiche a mano: dove porta «Come dice la regola». */
    ruleState: CustomerState;
    /** La modifica a mano; `visible` = rimesso visibile (`visible_override` true). */
    manual: CustomerState | null;
    /** Chi decide lo stato di adesso. */
    source: "none" | "rule" | "manual";
    /** La frase della provenienza; null se non c'è niente da dire. */
    note: string | null;
    price: string | null;
    /** Il listino barrato, quando la regola prezzi lo mostra. */
    originalPrice: string | null;
    /** «Prezzo dalla regola «X»», se la regola prezzi tocca il prodotto che il cliente vede. */
    priceNote: string | null;
};

export type StateCounts = Record<CustomerState, number>;

export type CatalogExplanation = {
    products: ProductExplanation[];
    counts: StateCounts;
    manualCount: number;
};

const EURO = (value: number) => `€${value.toFixed(2)}`;

function findProduct(catalog: ResolvedCatalog | undefined, productId: string): ResolvedProduct | undefined {
    for (const category of catalog?.categories ?? []) {
        const found = category.products.find(p => p.id === productId);
        if (found) return found;
    }
    return undefined;
}

/**
 * Lo stato del prodotto in un catalogo risolto: assente = nascosto. Un padre
 * nascosto che tiene le varianti (`parentSelected` false) conta come
 * nascosto: il prodotto della riga non si vede.
 */
function stateIn(catalog: ResolvedCatalog | undefined, productId: string): CustomerState {
    const product = findProduct(catalog, productId);
    if (!product || product.parentSelected === false) return "hidden";
    return product.is_disabled ? "unavailable" : "visible";
}

export function manualStateOf(row: ActivityProductOverrideRow | undefined): CustomerState | null {
    if (!row || row.visible_override === null || row.visible_override === undefined) return null;
    if (row.visible_override === true) return "visible";
    return row.mode === "disable" ? "unavailable" : "hidden";
}

function ruleSays(state: CustomerState, rule: string): string {
    return state === "hidden" ? `Nascosto dalla regola «${rule}»` : `Non disponibile per la regola «${rule}»`;
}

function ruleWould(state: CustomerState, rule: string): string {
    return state === "hidden"
        ? `la regola «${rule}» lo nasconderebbe`
        : `la regola «${rule}» lo segnerebbe non disponibile`;
}

/** La frase della provenienza (§19.4) e chi decide lo stato. */
function describeProvenance(
    state: CustomerState,
    ruleState: CustomerState,
    manual: CustomerState | null,
    ruleName: string | null
): { source: ProductExplanation["source"]; note: string | null } {
    if (manual === null) {
        if (state === "visible" || !ruleName || ruleState !== state) return { source: "none", note: null };
        return { source: "rule", note: ruleSays(state, ruleName) };
    }
    // La mano chiede uno stato che non passa: una regola ha tolto il prodotto
    // e lo strato 4 rimette solo i «visibile» (resolver, strato 4).
    if (state !== manual) {
        if (ruleName && state === ruleState) {
            return { source: "rule", note: `${ruleSays(state, ruleName)} · la modifica a mano non lo rimette` };
        }
        return { source: "none", note: null };
    }
    if (manual === "visible") {
        if (ruleName && ruleState !== "visible") {
            return { source: "manual", note: `Rimesso visibile a mano · ${ruleWould(ruleState, ruleName)}` };
        }
        return { source: "manual", note: "Tenuto visibile a mano · adesso nessuna regola lo nasconderebbe, ma la modifica resta" };
    }
    const own = manual === "hidden" ? "Nascosto a mano" : "Non disponibile a mano";
    if (!ruleName || ruleState === "visible") return { source: "manual", note: own };
    if (ruleState === manual) {
        const also = manual === "hidden" ? `anche la regola «${ruleName}» lo nasconde` : `anche la regola «${ruleName}» lo segna non disponibile`;
        return { source: "manual", note: `${own} · ${also}` };
    }
    return { source: "manual", note: `${own} · ${ruleWould(ruleState, ruleName)}` };
}

function priceOf(product: ResolvedProduct): { price: string | null; original: string | null } {
    const label = getDisplayPrice({ base_price: product.price ?? null, from_price: product.from_price }).label;
    return {
        price: label || null,
        original: typeof product.original_price === "number" ? EURO(product.original_price) : null
    };
}

/** I prodotti che una regola prezzi tocca: il prodotto, le sue varianti o i loro formati. */
function touchedByPriceRule(product: ResolvedProduct, rows: PriceRuleRow[]): boolean {
    if (rows.length === 0) return false;
    const ids = new Set<string>([product.id, ...(product.variants ?? []).map(v => v.id)]);
    return rows.some(row => ids.has(row.product_id));
}

export function explainCatalog(input: CatalogExplanationInput): CatalogExplanation {
    const { base, final, visibilityRule, visibilityRows, priceRule, priceRows, manual } = input;

    // Strati 1–2 senza la mano: dove porta «Come dice la regola». Lo strato
    // prezzi non cambia la visibilità, non serve qui.
    const rowsByProduct: Record<string, VisibilityOverrideRow> = {};
    for (const row of visibilityRule ? visibilityRows : []) rowsByProduct[row.product_id] = row;
    const ruleCatalog = visibilityRule
        ? applyVisibilityOverridesToCatalog(base, rowsByProduct, visibilityRule.mode)
        : base;

    const counts: StateCounts = { visible: 0, hidden: 0, unavailable: 0 };
    let manualCount = 0;
    const products: ProductExplanation[] = [];
    const seen = new Set<string>();

    for (const category of base.categories ?? []) {
        for (const baseProduct of category.products) {
            // Un prodotto in più categorie è una riga sola, come nell'elenco.
            if (seen.has(baseProduct.id)) continue;
            seen.add(baseProduct.id);

            const state = stateIn(final, baseProduct.id);
            const ruleState = stateIn(ruleCatalog, baseProduct.id);
            const manualState = manualStateOf(manual[baseProduct.id]);
            const { source, note } = describeProvenance(state, ruleState, manualState, visibilityRule?.name ?? null);

            // Il prezzo è quello che vede il cliente: dal catalogo finale se il
            // prodotto c'è, altrimenti quello del menù.
            const shown = findProduct(final, baseProduct.id);
            const { price, original } = priceOf(shown ?? baseProduct);
            const fromRule = !!priceRule && !!shown && touchedByPriceRule(baseProduct, priceRows);

            counts[state] += 1;
            if (manualState !== null) manualCount += 1;
            products.push({
                productId: baseProduct.id,
                name: baseProduct.name,
                categoryName: category.name,
                state,
                ruleState,
                manual: manualState,
                source,
                note,
                price,
                originalPrice: shown ? original : null,
                priceNote: fromRule && priceRule ? `Prezzo dalla regola «${priceRule.name}»` : null
            });
        }
    }

    return { products, counts, manualCount };
}

// ── L'esito della sede (§19.2, banda) ────────────────────────────────────────

export type OutcomeKind = "showing" | "empty" | "noRule" | "noneNow" | "suspended" | "subscription";

export type OutcomeInput = {
    seatName: string;
    /** `activities.status === "active"`. */
    seatPublished: boolean;
    /**
     * L'abbonamento serve il menù: `active`, `trialing`, `past_due`, lo
     * stesso insieme di `VALID_SUBSCRIPTION_STATUSES` che `resolve-public-catalog`
     * usa (`_shared/checkOrderingState.ts`).
     */
    subscriptionServing: boolean;
    /** Esiste almeno una regola menù accesa per la sede (`hasConfiguredCatalogRule`). */
    hasCatalogRule: boolean;
    /** Il menù della regola che vince adesso; null se nessuna vince. */
    catalogName: string | null;
    /** Il resolver ha qualcosa da mostrare. */
    renderable: boolean;
};

export type MissingStep = "seat" | "subscription" | "rule" | "products";

export type Outcome = {
    kind: OutcomeKind;
    headline: string;
    /**
     * Il titolo senza «I clienti di <sede>»: «vedono Pranzo», «non vedono il
     * menù: la sede è sospesa». La banda della pagina lo apre con l'ora.
     */
    verdict: string;
    /** «Cosa manca»: i passi che mancano, nell'ordine in cui l'Edge li controlla. */
    missing: MissingStep[];
};

export const MISSING_STEP_LABEL: Record<MissingStep, string> = {
    seat: "Sede online",
    subscription: "Abbonamento attivo",
    rule: "Una regola menù che valga adesso",
    products: "Almeno un prodotto visibile"
};

/**
 * Cosa vede il cliente della sede, adesso, nell'ordine dei cancelli di
 * `resolve-public-catalog`: sede sospesa, abbonamento, poi il resolver.
 */
export function describeOutcome(input: OutcomeInput): Outcome {
    const { seatName, seatPublished, subscriptionServing, hasCatalogRule, catalogName, renderable } = input;
    const missing: MissingStep[] = [];
    if (!seatPublished) missing.push("seat");
    if (!subscriptionServing) missing.push("subscription");
    if (!catalogName) missing.push("rule");
    else if (!renderable) missing.push("products");

    const who = `I clienti di ${seatName}`;
    const outcome = (kind: OutcomeKind, verdict: string): Outcome => ({ kind, headline: `${who} ${verdict}`, verdict, missing });
    if (!seatPublished) return outcome("suspended", "non vedono il menù: la sede è sospesa");
    if (!subscriptionServing) return outcome("subscription", "non vedono il menù: l'abbonamento non è attivo");
    if (!catalogName) {
        return hasCatalogRule
            ? outcome("noneNow", "non vedono nessun menù: nessuna regola menù vale adesso")
            : outcome("noRule", "non vedono nessun menù: nessuna regola gliene assegna uno");
    }
    if (!renderable) return outcome("empty", `non vedono prodotti: ${catalogName} è vuoto adesso`);
    return outcome("showing", `vedono ${catalogName}`);
}

function plural(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`;
}

/** «1 visibile · 2 nascosti · 1 non disponibile». */
export function describeCounts(counts: StateCounts): string {
    return [
        plural(counts.visible, "visibile", "visibili"),
        plural(counts.hidden, "nascosto", "nascosti"),
        plural(counts.unavailable, "non disponibile", "non disponibili")
    ].join(" · ");
}
