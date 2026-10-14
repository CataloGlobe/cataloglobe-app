import { beforeEach, describe, expect, it } from "vitest";
import { validateAndSnapshotOrderItems } from "./validateOrderItems.ts";

// Il prezzo dell'ordine è quello della pagina pubblica: una regola prezzi
// cambia anche i piatti senza formati (applyPriceOverridesToCatalog, ramo
// «Single-price product»), non solo quelli col formato.

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
        ...extra
    };
}

beforeEach(() => {
    tables = {
        customer_sessions: [
            {
                id: SESSION,
                tenant_id: TENANT,
                activity_id: "activity-1",
                current_table_id: "table-1",
                order_group_id: "group-1",
                customer_name: "Ada",
                expires_at: new Date(Date.now() + 3_600_000).toISOString()
            }
        ],
        activity_group_members: [],
        schedule_targets: [],
        schedule_slots: [],
        schedule_slot_targets: [],
        schedule_menu: [],
        schedule_style: [],
        // Il fake non fa join: l'embed `layout` sta già nella riga.
        schedules: [rule("layout-1", "layout", { layout: { catalog_id: "c-1" } }), rule("price-1", "price")],
        catalog_category_products: [
            { catalog_id: "c-1", tenant_id: TENANT, category_id: "cat-1", product_id: "p-burger", variant_product_id: null },
            { catalog_id: "c-1", tenant_id: TENANT, category_id: "cat-1", product_id: "p-fries", variant_product_id: null }
        ],
        products: [
            { id: "p-burger", tenant_id: TENANT, name: "Big Arch", base_price: 8, option_groups: [] },
            { id: "p-fries", tenant_id: TENANT, name: "Patate", base_price: 3, option_groups: [] }
        ],
        product_availability_overrides: [],
        activity_product_overrides: [],
        schedule_price_overrides: [
            { tenant_id: TENANT, schedule_id: "price-1", product_id: "p-burger", option_value_id: null, override_price: 5 }
        ]
    };
});

describe("validateOrderItems, prezzo dei piatti senza formati", () => {
    it("la regola prezzi vale anche sul piatto senza formati, gli altri restano al prezzo base", async () => {
        const result = await validateAndSnapshotOrderItems(fakeSupabase as never, SESSION, [
            { product_id: "p-burger", quantity: 2 },
            { product_id: "p-fries", quantity: 1 }
        ]);
        expect(result.items.map(i => [i.product_id, i.unit_price_snapshot, i.line_total])).toEqual([
            ["p-burger", 5, 10],
            ["p-fries", 3, 3]
        ]);
        expect(result.total_amount).toBe(13);
    });

    it("senza prezzo base, l'override basta a ordinare il piatto", async () => {
        tables.products[0].base_price = null;
        const result = await validateAndSnapshotOrderItems(fakeSupabase as never, SESSION, [
            { product_id: "p-burger", quantity: 1 }
        ]);
        expect(result.items[0].unit_price_snapshot).toBe(5);
    });

    it("senza prezzo base né override: errore come oggi", async () => {
        tables.products[1].base_price = null;
        await expect(
            validateAndSnapshotOrderItems(fakeSupabase as never, SESSION, [{ product_id: "p-fries", quantity: 1 }])
        ).rejects.toMatchObject({ code: "INVALID_OPTIONS", details: { reason: "product_missing_base_price" } });
    });
});
