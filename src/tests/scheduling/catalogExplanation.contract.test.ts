import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/**
 * Contratto di `explainCatalog` (§50.20): la provenienza ricavata nel
 * pannello deve dire la stessa cosa del resolver vero. Il resolver gira qui
 * per intero (`resolveActivityCatalogs` del frontend, la copia che è in SYNC
 * con l'Edge) su un database finto:
 * - lo stato di ogni prodotto è quello che il resolver mostra;
 * - `ruleState` («Come dice la regola») è quello che il resolver mostra
 *   quando le modifiche a mano non ci sono.
 */

const db = vi.hoisted(() => ({ tables: {} as Record<string, Array<Record<string, unknown>>> }));

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown }> {
    private readonly filters: Array<(row: Row) => boolean> = [];
    private selectClause = "";

    constructor(private readonly table: string) {}

    select(columns: string) {
        this.selectClause = columns;
        return this;
    }

    eq(column: string, value: unknown) {
        this.filters.push(row => row[column] === value);
        return this;
    }

    in(column: string, values: unknown[]) {
        const set = new Set(values);
        this.filters.push(row => set.has(row[column]));
        return this;
    }

    maybeSingle() {
        const rows = this.rows();
        return Promise.resolve({ data: rows[0] ?? null, error: null });
    }

    then<T1 = { data: unknown; error: unknown }, T2 = never>(
        onfulfilled?: ((value: { data: unknown; error: unknown }) => T1 | PromiseLike<T1>) | null,
        onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
    ): Promise<T1 | T2> {
        return Promise.resolve({ data: this.rows(), error: null }).then(onfulfilled ?? undefined, onrejected ?? undefined);
    }

    private rows(): Row[] {
        const rows = (db.tables[this.table] ?? []).filter(row => this.filters.every(f => f(row)));
        if (this.table === "schedules" && this.selectClause.includes("layout:schedule_layout")) {
            return rows.map(row => {
                const layout = (db.tables.schedule_layout ?? []).find(l => l.schedule_id === row.id);
                return { ...row, layout: layout ? { catalog_id: layout.catalog_id, style: null } : null };
            });
        }
        return rows.map(row => ({ ...row }));
    }
}

const fakeSupabase = {
    from: (table: string) => new FakeQuery(table),
    rpc: () => Promise.resolve({ data: [], error: null })
};

vi.mock("@/services/supabase/client", () => ({ supabase: fakeSupabase }));

const { resolveActivityCatalogs, loadCatalogById } = await import("@/services/supabase/resolveActivityCatalogs");
const { resolveRulesForActivity } = await import("@/services/supabase/scheduleResolver");
const { toRomeDateTime } = await import("@/services/supabase/schedulingNow");
const { explainCatalog, manualStateOf } = await import("@/utils/catalogExplanation");
type CatalogExplanation = import("@/utils/catalogExplanation").CatalogExplanation;
type CustomerState = import("@/utils/catalogExplanation").CustomerState;
type ResolvedCatalog = import("@/services/supabase/resolveActivityCatalogs").ResolvedCatalog;

const TENANT = "00000000-0000-0000-0000-0000000000aa";
const SEAT = "00000000-0000-0000-0000-0000000000bb";
const CATALOG = "catalog-1";
const NOW = toRomeDateTime(new Date("2026-09-23T12:00:00+02:00"));

type RuleMode = "none" | "hide" | "disable";
type ManualMode = "none" | "hide" | "disable" | "visible";

const RULE_MODES: RuleMode[] = ["none", "hide", "disable"];
const MANUAL_MODES: ManualMode[] = ["none", "hide", "disable", "visible"];

const comboId = (rule: RuleMode, manual: ManualMode) => `p-${rule}-${manual}`;

const rawProduct = (id: string, price: number): Row => ({
    id,
    name: id,
    base_price: price,
    parent_product_id: null,
    product_type: "simple",
    option_groups: [],
    variants: []
});

const timeRule = (id: string, name: string, ruleType: string): Row => ({
    id,
    tenant_id: TENANT,
    name,
    rule_type: ruleType,
    enabled: true,
    apply_to_all: true,
    priority: 21,
    created_at: "2026-01-01T00:00:00.000Z",
    time_mode: "always",
    days_of_week: null,
    time_from: null,
    time_to: null,
    start_at: null,
    end_at: null,
    visibility_mode: "hide"
});

/**
 * Un prodotto per ogni coppia (regola di disponibilità × modifica a mano),
 * tutti nella stessa categoria, più «control» sempre visibile (tiene viva la
 * categoria) e «solo-bevanda» da solo in una seconda categoria, nascosto
 * dalla regola e «non disponibile» a mano.
 */
function buildTables(options: { visibilityRule: boolean; priceRule: boolean }): Tables {
    const combos = RULE_MODES.flatMap(rule => MANUAL_MODES.map(manual => ({ rule, manual, id: comboId(rule, manual) })));
    const products = [{ id: "control", price: 5 }, ...combos.map(c => ({ id: c.id, price: 7.5 }))];
    const catalogRow = {
        id: CATALOG,
        tenant_id: TENANT,
        name: "Menù contratto",
        categories: [
            {
                id: "cat-a",
                name: "Panini",
                level: 1,
                sort_order: 0,
                parent_category_id: null,
                products: products.map((p, i) => ({
                    id: `cp-${p.id}`,
                    sort_order: i,
                    product_id: p.id,
                    variant_product_id: null,
                    product: rawProduct(p.id, p.price)
                }))
            },
            {
                id: "cat-b",
                name: "Bevande",
                level: 1,
                sort_order: 1,
                parent_category_id: null,
                products: [{ id: "cp-solo", sort_order: 0, product_id: "solo-bevanda", variant_product_id: null, product: rawProduct("solo-bevanda", 2.5) }]
            }
        ]
    };

    const visibilityRows: Row[] = combos
        .filter(c => c.rule !== "none")
        .map(c => ({ tenant_id: TENANT, schedule_id: "rule-vis", product_id: c.id, visible: false, mode: c.rule }));
    visibilityRows.push({ tenant_id: TENANT, schedule_id: "rule-vis", product_id: "solo-bevanda", visible: false, mode: "hide" });

    const manualRows: Row[] = combos
        .filter(c => c.manual !== "none")
        .map(c => ({
            activity_id: SEAT,
            product_id: c.id,
            visible_override: c.manual === "visible",
            mode: c.manual === "visible" ? null : c.manual
        }));
    manualRows.push({ activity_id: SEAT, product_id: "solo-bevanda", visible_override: false, mode: "disable" });

    return {
        catalogs: [catalogRow],
        schedules: [
            timeRule("rule-layout", "Pranzo", "layout"),
            ...(options.visibilityRule ? [timeRule("rule-vis", "Sera", "visibility")] : []),
            ...(options.priceRule ? [timeRule("rule-price", "Happy", "price")] : [])
        ],
        schedule_layout: [{ tenant_id: TENANT, schedule_id: "rule-layout", catalog_id: CATALOG }],
        schedule_targets: [],
        activity_group_members: [],
        schedule_visibility_overrides: options.visibilityRule ? visibilityRows : [],
        schedule_price_overrides: options.priceRule
            ? [
                  { tenant_id: TENANT, schedule_id: "rule-price", product_id: "control", option_value_id: null, override_price: 4, show_original_price: true },
                  { tenant_id: TENANT, schedule_id: "rule-price", product_id: comboId("hide", "none"), option_value_id: null, override_price: 1, show_original_price: false }
              ]
            : [],
        activity_product_overrides: manualRows
    };
}

/** Quello che fa la pagina: resolver + le righe delle regole che vincono. */
async function explainFromDb(): Promise<{ explanation: CatalogExplanation; final: ResolvedCatalog | undefined }> {
    const resolved = await resolveActivityCatalogs(SEAT, NOW, TENANT);
    const rules = await resolveRulesForActivity({ supabase: fakeSupabase, activityId: SEAT, tenantId: TENANT, now: NOW });
    const base = await loadCatalogById(CATALOG, TENANT);
    if (!base) throw new Error("catalogo base assente");
    const visId = rules.visibilityRule?.scheduleId ?? null;
    const name = (id: string | null) => String(db.tables.schedules.find(r => r.id === id)?.name ?? "");
    const manual = Object.fromEntries(
        db.tables.activity_product_overrides.map(r => [
            String(r.product_id),
            { product_id: String(r.product_id), visible_override: r.visible_override as boolean | null, mode: (r.mode ?? null) as "hide" | "disable" | null }
        ])
    );
    const explanation = explainCatalog({
        base,
        final: resolved.catalog,
        visibilityRule: visId ? { id: visId, name: name(visId), mode: rules.visibilityRule?.mode ?? "hide" } : null,
        visibilityRows: db.tables.schedule_visibility_overrides
            .filter(r => r.schedule_id === visId)
            .map(r => ({ product_id: String(r.product_id), visible: r.visible as boolean, mode: r.mode as "hide" | "disable" })),
        priceRule: rules.priceRuleId ? { id: rules.priceRuleId, name: name(rules.priceRuleId) } : null,
        priceRows: db.tables.schedule_price_overrides
            .filter(r => r.schedule_id === rules.priceRuleId)
            .map(r => ({ product_id: String(r.product_id), option_value_id: (r.option_value_id ?? null) as string | null })),
        manual
    });
    return { explanation, final: resolved.catalog };
}

/** Lo stato di un prodotto nel catalogo che esce dal resolver. */
function resolverState(catalog: ResolvedCatalog | undefined, id: string): CustomerState {
    for (const category of catalog?.categories ?? []) {
        const product = category.products.find(p => p.id === id);
        if (product) return product.is_disabled ? "unavailable" : "visible";
    }
    return "hidden";
}

function row(explanation: CatalogExplanation, id: string) {
    const found = explanation.products.find(p => p.productId === id);
    if (!found) throw new Error(`riga assente: ${id}`);
    return found;
}

describe("explainCatalog — parità col resolver", () => {
    beforeEach(() => {
        db.tables = buildTables({ visibilityRule: true, priceRule: true });
    });

    it("lo stato di ogni prodotto è quello che il resolver mostra", async () => {
        const { explanation, final } = await explainFromDb();
        expect(explanation.products).toHaveLength(1 + RULE_MODES.length * MANUAL_MODES.length + 1);
        for (const product of explanation.products) {
            expect(product.state, product.productId).toBe(resolverState(final, product.productId));
        }
    });

    it("«Come dice la regola» porta allo stato del resolver senza modifiche a mano", async () => {
        const withManual = await explainFromDb();
        db.tables.activity_product_overrides = [];
        const { final: ruleOnly } = await explainFromDb();
        for (const product of withManual.explanation.products) {
            expect(product.ruleState, product.productId).toBe(resolverState(ruleOnly, product.productId));
        }
    });

    it("i conteggi sono quelli del resolver, le modifiche a mano quelle della sede", async () => {
        const { explanation, final } = await explainFromDb();
        const expected = { visible: 0, hidden: 0, unavailable: 0 };
        for (const product of explanation.products) expected[resolverState(final, product.productId)] += 1;
        expect(explanation.counts).toEqual(expected);
        expect(explanation.manualCount).toBe(db.tables.activity_product_overrides.length);
    });
});

describe("explainCatalog — la provenienza", () => {
    beforeEach(() => {
        db.tables = buildTables({ visibilityRule: true, priceRule: true });
    });

    it("dice la regola, la mano, e quando la mano non basta", async () => {
        const { explanation } = await explainFromDb();
        expect(row(explanation, comboId("none", "none"))).toMatchObject({ source: "none", note: null, state: "visible" });
        expect(row(explanation, comboId("hide", "none"))).toMatchObject({ source: "rule", note: "Nascosto dalla regola «Sera»" });
        expect(row(explanation, comboId("disable", "none"))).toMatchObject({ source: "rule", note: "Non disponibile per la regola «Sera»" });
        expect(row(explanation, comboId("none", "hide")).note).toBe("Nascosto a mano");
        expect(row(explanation, comboId("none", "disable")).note).toBe("Non disponibile a mano");
        expect(row(explanation, comboId("hide", "hide")).note).toBe("Nascosto a mano · anche la regola «Sera» lo nasconde");
        expect(row(explanation, comboId("disable", "disable")).note).toBe("Non disponibile a mano · anche la regola «Sera» lo segna non disponibile");
        expect(row(explanation, comboId("disable", "hide")).note).toBe("Nascosto a mano · la regola «Sera» lo segnerebbe non disponibile");
        // La regola toglie il prodotto, lo strato 4 rimette solo i «visibile».
        expect(row(explanation, comboId("hide", "disable"))).toMatchObject({
            state: "hidden",
            source: "rule",
            note: "Nascosto dalla regola «Sera» · la modifica a mano non lo rimette"
        });
        expect(row(explanation, comboId("hide", "visible"))).toMatchObject({
            state: "visible",
            source: "manual",
            note: "Rimesso visibile a mano · la regola «Sera» lo nasconderebbe"
        });
        expect(row(explanation, comboId("none", "visible")).note).toBe(
            "Tenuto visibile a mano · adesso nessuna regola lo nasconderebbe, ma la modifica resta"
        );
    });

    it("un prodotto solo nella sua categoria, tolto dalla regola, resta tolto anche se la mano lo vuole", async () => {
        const { explanation } = await explainFromDb();
        expect(row(explanation, "solo-bevanda")).toMatchObject({ state: "hidden", manual: "unavailable", source: "rule" });
    });

    it("senza regola di disponibilità parla solo la mano", async () => {
        db.tables = buildTables({ visibilityRule: false, priceRule: false });
        const { explanation } = await explainFromDb();
        expect(row(explanation, comboId("hide", "none"))).toMatchObject({ state: "visible", source: "none", note: null });
        expect(row(explanation, comboId("hide", "hide")).note).toBe("Nascosto a mano");
        expect(row(explanation, comboId("none", "visible")).note).toBe(
            "Tenuto visibile a mano · adesso nessuna regola lo nasconderebbe, ma la modifica resta"
        );
    });
});

describe("explainCatalog — il prezzo", () => {
    beforeEach(() => {
        db.tables = buildTables({ visibilityRule: true, priceRule: true });
    });

    it("il prezzo della regola col listino barrato, se la regola lo mostra", async () => {
        const { explanation } = await explainFromDb();
        expect(row(explanation, "control")).toMatchObject({
            price: "4,00 €",
            originalPrice: "5,00 €",
            priceNote: "Prezzo dalla regola «Happy»"
        });
    });

    it("un prodotto che il cliente non vede non porta il prezzo della regola", async () => {
        const { explanation } = await explainFromDb();
        expect(row(explanation, comboId("hide", "none"))).toMatchObject({ price: "7,50 €", originalPrice: null, priceNote: null });
    });

    it("senza regola prezzi il prezzo è quello del menù", async () => {
        db.tables = buildTables({ visibilityRule: false, priceRule: false });
        const { explanation } = await explainFromDb();
        expect(row(explanation, "control")).toMatchObject({ price: "5,00 €", originalPrice: null, priceNote: null });
    });
});

describe("manualStateOf", () => {
    it("legge le tre forme della modifica a mano", () => {
        expect(manualStateOf(undefined)).toBeNull();
        expect(manualStateOf({ product_id: "x", visible_override: null })).toBeNull();
        expect(manualStateOf({ product_id: "x", visible_override: true })).toBe("visible");
        expect(manualStateOf({ product_id: "x", visible_override: false, mode: "disable" })).toBe("unavailable");
        expect(manualStateOf({ product_id: "x", visible_override: false, mode: "hide" })).toBe("hidden");
        expect(manualStateOf({ product_id: "x", visible_override: false, mode: null })).toBe("hidden");
    });
});
