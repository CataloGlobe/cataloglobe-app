import { beforeEach, describe, expect, it } from "vitest";
import { validateAndSnapshotOrderItems, ValidateOrderItemsError } from "./validateOrderItems.ts";

// Piano 9b, passo 3c: con più menù in onda («insieme») si ordina da tutti, e i
// prezzi di più regole si sommano con la regola della pagina pubblica (per lo
// stesso piatto vale la prima regola che lo tocca).

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

let tables: Tables = {};

class FakeQuery {
    private filters: Array<(row: Row) => boolean> = [];
    constructor(private readonly rows: Row[]) {}
    select() {
        return this;
    }
    eq(column: string, value: unknown) {
        this.filters.push(row => row[column] === value);
        return this;
    }
    in(column: string, values: unknown[]) {
        this.filters.push(row => values.includes(row[column]));
        return this;
    }
    private run() {
        return this.rows.filter(row => this.filters.every(filter => filter(row))).map(row => ({ ...row }));
    }
    maybeSingle() {
        return Promise.resolve({ data: this.run()[0] ?? null, error: null });
    }
    then<T1 = unknown, T2 = never>(
        onfulfilled?: ((value: { data: Row[]; error: null }) => T1 | PromiseLike<T1>) | null,
        onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
    ) {
        return Promise.resolve({ data: this.run(), error: null }).then(onfulfilled, onrejected);
    }
}

const fakeSupabase = {
    from: (table: string) => new FakeQuery(tables[table] ?? []),
    rpc: () => Promise.resolve({ data: [], error: null })
};

const TENANT = "tenant-1";
const SEAT = "activity-1";
const SESSION = "session-1";

function rule(id: string, ruleType: string, extra: Row = {}): Row {
    return {
        id,
        tenant_id: TENANT,
        rule_type: ruleType,
        enabled: true,
        apply_to_all: true,
        priority: 21,
        created_at: "2026-01-01T00:00:00.000Z",
        on_air_since: "2026-01-01T00:00:00.000Z",
        overlap_mode: null,
        time_mode: "always",
        days_of_week: null,
        time_from: null,
        time_to: null,
        start_at: null,
        end_at: null,
        visibility_mode: "hide",
        ...extra
    };
}

// Un formato solo («Unico»): l'override del piatto vale sul suo prezzo.
function product(id: string, basePrice: number): Row {
    return {
        id,
        tenant_id: TENANT,
        name: id,
        base_price: basePrice,
        option_groups: [
            {
                id: `g-${id}`,
                tenant_id: TENANT,
                name: "Formato",
                group_kind: "PRIMARY_PRICE",
                pricing_mode: "ABSOLUTE",
                is_required: true,
                max_selectable: 1,
                values: [{ id: `v-${id}`, tenant_id: TENANT, name: "Unico", absolute_price: basePrice, price_modifier: null }]
            }
        ]
    };
}

function link(catalogId: string, productId: string, tenantId = TENANT): Row {
    return { catalog_id: catalogId, tenant_id: tenantId, category_id: `cat-${catalogId}`, product_id: productId, variant_product_id: null };
}

function price(scheduleId: string, productId: string, value: number): Row {
    return { tenant_id: TENANT, schedule_id: scheduleId, product_id: productId, option_value_id: null, override_price: value };
}

// Il fake non fa join: chi chiama la sessione la legge con la scadenza futura.
const future = new Date(Date.now() + 3_600_000).toISOString();

beforeEach(() => {
    tables = {
        customer_sessions: [
            {
                id: SESSION,
                tenant_id: TENANT,
                activity_id: SEAT,
                current_table_id: "table-1",
                order_group_id: "group-1",
                customer_name: "Ada",
                expires_at: future
            }
        ],
        activity_group_members: [],
        schedule_targets: [],
        schedule_slots: [],
        schedule_slot_targets: [],
        schedule_layout: [],
        schedule_style: [],
        schedule_menu: [
            { schedule_id: "m-food", catalog_id: "c-food" },
            { schedule_id: "m-wine", catalog_id: "c-wine" },
            { schedule_id: "m-night", catalog_id: "c-night" }
        ],
        catalogs: [
            { id: "c-food", tenant_id: TENANT, name: "Cucina", sort_order: 1 },
            { id: "c-wine", tenant_id: TENANT, name: "Vini", sort_order: 2 },
            { id: "c-night", tenant_id: TENANT, name: "Notte", sort_order: 3 }
        ],
        schedules: [
            rule("m-food", "menu", { overlap_mode: "together" }),
            rule("m-wine", "menu", { overlap_mode: "together" }),
            // Parte più avanti: fuori onda.
            rule("m-night", "menu", { overlap_mode: "together", start_at: "2099-01-01T00:00:00.000Z" })
        ],
        catalog_category_products: [link("c-food", "p-pasta"), link("c-wine", "p-wine"), link("c-night", "p-late")],
        products: [product("p-pasta", 10), product("p-wine", 6), product("p-late", 4)],
        product_availability_overrides: [],
        activity_product_overrides: [],
        schedule_price_overrides: []
    };
});

function order(...productIds: string[]) {
    return validateAndSnapshotOrderItems(
        fakeSupabase as never,
        SESSION,
        productIds.map(product_id => ({ product_id, quantity: 1, primary_option_value_id: `v-${product_id}` }))
    );
}

describe("validateOrderItems con più menù in onda", () => {
    it("si ordina dai due menù «insieme»", async () => {
        const result = await order("p-pasta", "p-wine");
        expect(result.items.map(i => [i.product_id, i.unit_price_snapshot])).toEqual([
            ["p-pasta", 10],
            ["p-wine", 6]
        ]);
        expect(result.total_amount).toBe(16);
    });

    it("un piatto di un menù fuori onda resta fuori", async () => {
        await expect(order("p-pasta", "p-late")).rejects.toMatchObject({
            code: "PRODUCT_NOT_IN_CATALOG",
            details: { invalid_product_ids: ["p-late"] }
        });
    });

    it("un collegamento di un altro tenant non rende ordinabile il piatto", async () => {
        tables.catalog_category_products.push(link("c-food", "p-late", "tenant-2"));
        await expect(order("p-late")).rejects.toBeInstanceOf(ValidateOrderItemsError);
    });

    it("prezzi di due regole: per lo stesso piatto la prima che lo tocca, come la pagina", async () => {
        tables.schedules.push(rule("price-seat", "price", { apply_to_all: false }), rule("price-all", "price"));
        tables.schedule_targets.push({
            id: "t-price",
            schedule_id: "price-seat",
            target_type: "activity",
            target_id: SEAT,
            overlap_mode: null
        });
        tables.schedule_price_overrides = [
            price("price-seat", "p-pasta", 7),
            price("price-all", "p-pasta", 9),
            price("price-all", "p-wine", 5)
        ];
        const result = await order("p-pasta", "p-wine");
        expect(result.items.map(i => [i.product_id, i.unit_price_snapshot])).toEqual([
            ["p-pasta", 7],
            ["p-wine", 5]
        ]);
        expect(result.resolved_schedule_id).toBe("price-seat");
    });

    it("nessun menù in onda: errore come oggi", async () => {
        tables.schedules = [];
        await expect(order("p-pasta")).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    });
});
