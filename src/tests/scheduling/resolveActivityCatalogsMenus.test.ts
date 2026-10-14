import { beforeEach, describe, expect, it, vi } from "vitest";

// Giudice nuovo (piano 9b, passo 3b): `resolveActivityCatalogs` con più menù,
// prezzi / disponibilità / in evidenza che si sommano. Le due copie (edge e
// pannello) sulla stessa base finta devono dare lo stesso payload.

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
    rpc: (fn: string, args?: Record<string, unknown>) => {
        if (fn !== "get_schedule_featured_contents") throw new Error(`rpc inattesa ${fn}`);
        const rows = (tables.featured_by_rule ?? []).filter(row => row.schedule_id === args?.p_schedule_id);
        return Promise.resolve({ data: rows, error: null });
    }
};

vi.mock("@/services/supabase/client", () => ({ supabase: fakeSupabase }));

const { resolveActivityCatalogs: resolveWeb } = await import("@/services/supabase/resolveActivityCatalogs");
const { resolveActivityCatalogs: resolveEdge } = await import(
    "../../../supabase/functions/_shared/resolveActivityCatalogs"
);
const { toRomeDateTime } = await import("@/services/supabase/schedulingNow");

const TENANT = "tenant-1";
const SEAT = "activity-1";
// Giovedì 26/03/2026 13:00 a Roma.
const NOON = toRomeDateTime(new Date("2026-03-26T12:00:00.000Z"));

function rawProduct(id: string, basePrice: number): Row {
    return {
        id,
        name: id,
        description: null,
        base_price: basePrice,
        parent_product_id: null,
        product_type: "simple",
        variants: [],
        attributes: [],
        allergens: [],
        characteristics: [],
        ingredients: [],
        notes: null,
        image_url: null,
        image_framing: null,
        image_aspect_ratio: null
    };
}

function rawCatalog(id: string, name: string, sortOrder: number, productIds: string[]): Row {
    return {
        id,
        tenant_id: TENANT,
        name,
        sort_order: sortOrder,
        categories: [
            {
                id: `cat-${id}`,
                name: "Sezione",
                level: 1,
                sort_order: 0,
                parent_category_id: null,
                products: productIds.map((productId, index) => ({
                    id: `cp-${id}-${productId}`,
                    sort_order: index,
                    product_id: productId,
                    variant_product_id: null,
                    product: rawProduct(productId, 10)
                }))
            }
        ]
    };
}

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

function featuredRow(scheduleId: string, contentId: string, slot: string, sortOrder: number): Row {
    return {
        schedule_id: scheduleId,
        slot,
        sort_order: sortOrder,
        featured_content: { id: contentId, title: contentId, status: "published", products: [] }
    };
}

async function resolveBoth() {
    const web = await resolveWeb(SEAT, NOON, TENANT);
    const edge = await resolveEdge(fakeSupabase, SEAT, NOON, TENANT);
    expect(edge).toEqual(web);
    return web;
}

function prices(catalog: { categories?: Array<{ products: Array<{ id: string; price?: number | null }> }> } | undefined) {
    return Object.fromEntries((catalog?.categories ?? []).flatMap(c => c.products.map(p => [p.id, p.price ?? null])));
}

beforeEach(() => {
    tables = {
        activity_group_members: [],
        schedule_targets: [],
        schedule_slots: [],
        schedule_slot_targets: [],
        schedule_layout: [],
        schedule_style: [],
        schedule_menu: [
            { schedule_id: "m-lunch", catalog_id: "c-lunch" },
            { schedule_id: "m-wine", catalog_id: "c-wine" },
            { schedule_id: "m-dinner", catalog_id: "c-dinner" }
        ],
        catalogs: [
            rawCatalog("c-lunch", "Pranzo", 2, ["p-1", "p-2"]),
            rawCatalog("c-wine", "Vini", 1, ["p-1", "p-3"]),
            rawCatalog("c-dinner", "Pranzo", 3, ["p-4"])
        ],
        schedules: [
            rule("m-lunch", "menu", { overlap_mode: "together" }),
            rule("m-wine", "menu", { overlap_mode: "together" }),
            rule("m-dinner", "menu", { overlap_mode: "together", time_mode: "window" })
        ],
        activity_product_overrides: [],
        schedule_visibility_overrides: [],
        schedule_price_overrides: [],
        featured_by_rule: []
    };
    tables.schedule_slots.push({
        id: "s-dinner",
        schedule_id: "m-dinner",
        days_of_week: null,
        start_minute: 1140,
        end_minute: 1380,
        sort_order: 0
    });
});

describe("resolveActivityCatalogs col giudice nuovo", () => {
    it("menù di adesso per sort_order, quelli di più tardi senza catalogo, slug unici", async () => {
        const result = await resolveBoth();
        expect(result.catalog?.id).toBe("c-wine");
        expect(
            result.menus?.map(m => [m.catalogId, m.slug, m.state, m.sortOrder, m.startMinute, m.productsCount])
        ).toEqual([
            ["c-wine", "vini", "now", 1, 0, 2],
            ["c-lunch", "pranzo", "now", 2, 0, 2],
            ["c-dinner", "pranzo-2", "later", 3, 1140, 1]
        ]);
        // Il primo è già `catalog` in cima; il secondo porta il suo; più tardi niente.
        expect(result.menus?.map(m => m.catalog?.id ?? null)).toEqual([null, "c-lunch", null]);
        expect(result.hasRenderableItems).toBe(true);
        expect(result.hasConfiguredCatalogRule).toBe(true);
    });

    it("un menù senza piatti da mostrare non entra in `menus`", async () => {
        tables.activity_product_overrides = [
            { activity_id: SEAT, product_id: "p-1", visible_override: false, mode: "hide" },
            { activity_id: SEAT, product_id: "p-3", visible_override: false, mode: "hide" }
        ];
        const result = await resolveBoth();
        expect(result.catalog?.id).toBe("c-lunch");
        expect(result.menus?.map(m => m.catalogId)).toEqual(["c-lunch", "c-dinner"]);
    });

    it("prezzi: per lo stesso piatto vale la prima regola che lo tocca, in tutti i menù", async () => {
        tables.schedules.push(
            rule("price-seat", "price", { apply_to_all: false }),
            rule("price-all", "price")
        );
        tables.schedule_targets.push({
            id: "t-price",
            schedule_id: "price-seat",
            target_type: "activity",
            target_id: SEAT,
            overlap_mode: null
        });
        tables.schedule_price_overrides = [
            { tenant_id: TENANT, schedule_id: "price-seat", product_id: "p-1", override_price: 7, show_original_price: false, option_value_id: null },
            { tenant_id: TENANT, schedule_id: "price-all", product_id: "p-1", override_price: 9, show_original_price: false, option_value_id: null },
            { tenant_id: TENANT, schedule_id: "price-all", product_id: "p-2", override_price: 8, show_original_price: false, option_value_id: null }
        ];
        const result = await resolveBoth();
        expect(prices(result.catalog)).toEqual({ "p-1": 7, "p-3": 10 });
        expect(prices(result.menus?.[1].catalog)).toEqual({ "p-1": 7, "p-2": 8 });
    });

    it("disponibilità: la prima regola che tocca il piatto, col suo modo", async () => {
        tables.schedules.push(
            rule("vis-new", "visibility", { on_air_since: "2026-02-01T00:00:00.000Z", visibility_mode: "disable" }),
            rule("vis-old", "visibility")
        );
        tables.schedule_visibility_overrides = [
            { tenant_id: TENANT, schedule_id: "vis-new", product_id: "p-1", visible: false, mode: null },
            { tenant_id: TENANT, schedule_id: "vis-old", product_id: "p-1", visible: false, mode: "hide" },
            { tenant_id: TENANT, schedule_id: "vis-old", product_id: "p-3", visible: false, mode: "hide" }
        ];
        const result = await resolveBoth();
        const wine = result.catalog?.categories?.[0].products ?? [];
        expect(wine.map(p => [p.id, p.is_disabled ?? false])).toEqual([["p-1", true]]);
    });

    it("in evidenza: i contenuti di tutte le regole, una volta sola", async () => {
        tables.schedules.push(
            rule("feat-new", "featured", { on_air_since: "2026-02-01T00:00:00.000Z" }),
            rule("feat-old", "featured")
        );
        tables.featured_by_rule = [
            featuredRow("feat-old", "fc-a", "after_catalog", 0),
            featuredRow("feat-old", "fc-b", "before_catalog", 1),
            featuredRow("feat-new", "fc-a", "after_catalog", 5),
            featuredRow("feat-new", "fc-c", "before_catalog", 0)
        ];
        const result = await resolveBoth();
        expect(result.featured?.before_catalog?.map(f => f.id)).toEqual(["fc-c", "fc-b"]);
        expect(result.featured?.after_catalog?.map(f => f.id)).toEqual(["fc-a"]);
    });

    it("una regola layout sola: payload di oggi, `menus` con un menù e senza catalogo doppio", async () => {
        // L'embed `layout:schedule_layout(...)` già nella riga: il finto non fa join.
        tables.schedules = [rule("layout-1", "layout", { layout: { catalog_id: "c-lunch", style: null } })];
        const result = await resolveBoth();
        expect(result.catalog?.id).toBe("c-lunch");
        expect(result.menus).toEqual([
            {
                catalogId: "c-lunch",
                slug: "pranzo",
                name: "Pranzo",
                sortOrder: 0,
                startMinute: 0,
                endMinute: 1440,
                state: "now",
                categoriesCount: 1,
                productsCount: 2
            }
        ]);
    });

    it("solo un menù più tardi: niente catalogo né `hasRenderableItems`, «nessun menù adesso» come oggi", async () => {
        tables.schedules = tables.schedules.filter(row => row.id === "m-dinner");
        const result = await resolveBoth();
        // Regola configurata ma nessuna adesso: `derivePageState` va su `isEmpty`.
        expect(result).toEqual({
            featured: { before_catalog: [], after_catalog: [] },
            hasConfiguredCatalogRule: true
        });
    });

    it("nessun menù in onda né più tardi: niente catalogo, come oggi", async () => {
        tables.schedules = [];
        const result = await resolveBoth();
        expect(result).toEqual({
            featured: { before_catalog: [], after_catalog: [] },
            hasConfiguredCatalogRule: false
        });
    });
});
