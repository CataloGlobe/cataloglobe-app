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

    it("nome lunghissimo: slug entro gli 80 caratteri di `?menu=` (api/ssr-render), anche col -2", async () => {
        const long = "Menu degustazione della domenica sera con i piatti della tradizione lombarda e i vini";
        tables.catalogs = tables.catalogs.map(c => (c.id === "c-wine" ? c : { ...c, name: long }));
        const result = await resolveBoth();
        const slugs = result.menus?.map(m => m.slug) ?? [];
        expect(slugs).toHaveLength(3);
        for (const slug of slugs) {
            expect(slug.length).toBeLessThanOrEqual(80);
            expect(slug).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
        }
        expect(slugs[2]).toBe(`${slugs[1]}-2`);
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

// Multi menù, passo 5: una sede come San Pietro Bistrò, quattro menù. Il
// ristorante ha due fasce, la gelateria prende il posto degli altri; l'ordine
// dei riquadri è `catalogs.sort_order` (riordino del back office).
describe("una sede con quattro menù (San Pietro)", () => {
    const slot = (scheduleId: string, n: number, from: number, to: number): Row => ({
        id: `s-${scheduleId}-${n}`,
        schedule_id: scheduleId,
        days_of_week: null,
        start_minute: from * 60,
        end_minute: to * 60,
        sort_order: n
    });
    const at = (utc: string) => toRomeDateTime(new Date(utc));
    async function resolveAt(time: ReturnType<typeof toRomeDateTime>) {
        const web = await resolveWeb(SEAT, time, TENANT);
        const edge = await resolveEdge(fakeSupabase, SEAT, time, TENANT);
        expect(edge).toEqual(web);
        return web;
    }
    const shape = (result: Awaited<ReturnType<typeof resolveAt>>) =>
        result.menus?.map(m => [m.catalogId, m.state, m.startMinute]);

    beforeEach(() => {
        tables.schedule_menu = [
            { schedule_id: "m-rist", catalog_id: "c-rist" },
            { schedule_id: "m-bar", catalog_id: "c-bar" },
            { schedule_id: "m-ape", catalog_id: "c-ape" },
            { schedule_id: "m-gel", catalog_id: "c-gel" }
        ];
        tables.catalogs = [
            rawCatalog("c-rist", "Ristorante", 1, ["p-1"]),
            rawCatalog("c-bar", "Bar e caffetteria", 2, ["p-2"]),
            rawCatalog("c-ape", "Aperitivo", 3, ["p-3"]),
            rawCatalog("c-gel", "Gelateria", 4, ["p-4"])
        ];
        tables.schedules = [
            rule("m-rist", "menu", { overlap_mode: "together", time_mode: "window" }),
            rule("m-bar", "menu", { overlap_mode: "together", time_mode: "window" }),
            rule("m-ape", "menu", { overlap_mode: "together", time_mode: "window" }),
            rule("m-gel", "menu", { overlap_mode: "replace", time_mode: "window" })
        ];
        tables.schedule_slots = [
            slot("m-rist", 0, 12, 15),
            slot("m-rist", 1, 19, 23),
            slot("m-bar", 0, 7, 19),
            slot("m-ape", 0, 18, 21),
            slot("m-gel", 0, 15, 18)
        ];
    });

    it("alle 13: ristorante e bar insieme, nell'ordine dato; più tardi gelateria e aperitivo per ora", async () => {
        const result = await resolveAt(at("2026-03-26T12:00:00.000Z"));
        expect(shape(result)).toEqual([
            ["c-rist", "now", 720],
            ["c-bar", "now", 420],
            ["c-gel", "later", 900],
            ["c-ape", "later", 1080]
        ]);
    });

    it("riordinati dal back office: il bar va prima del ristorante", async () => {
        tables.catalogs = tables.catalogs.map(c =>
            c.id === "c-bar" ? { ...c, sort_order: 1 } : c.id === "c-rist" ? { ...c, sort_order: 2 } : c
        );
        const result = await resolveAt(at("2026-03-26T12:00:00.000Z"));
        expect(shape(result)?.filter(m => m[1] === "now").map(m => m[0])).toEqual(["c-bar", "c-rist"]);
    });

    it("più tardi alla stessa ora: prima chi viene prima nell'ordine", async () => {
        // gelateria «insieme» dalle 18 come l'aperitivo, e prima di lui nell'ordine
        // (l'alfabeto direbbe il contrario: conta sort_order)
        tables.schedules = tables.schedules.map(r => (r.id === "m-gel" ? { ...r, overlap_mode: "together" } : r));
        tables.schedule_slots = tables.schedule_slots.map(s => (s.schedule_id === "m-gel" ? slot("m-gel", 0, 18, 23) : s));
        tables.catalogs = tables.catalogs.map(c =>
            c.id === "c-gel" ? { ...c, sort_order: 3 } : c.id === "c-ape" ? { ...c, sort_order: 4 } : c
        );
        const result = await resolveAt(at("2026-03-26T12:00:00.000Z"));
        expect(shape(result)?.filter(m => m[1] === "later")).toEqual([
            ["c-gel", "later", 1080],
            ["c-ape", "later", 1080]
        ]);
    });

    it("alle 16 la gelateria prende il posto degli altri", async () => {
        const result = await resolveAt(at("2026-03-26T15:00:00.000Z"));
        expect(result.catalog?.id).toBe("c-gel");
        expect(shape(result)?.filter(m => m[1] === "now").map(m => m[0])).toEqual(["c-gel"]);
    });

    it("alle 20 la seconda fascia del ristorante, insieme all'aperitivo", async () => {
        const result = await resolveAt(at("2026-03-26T19:00:00.000Z"));
        expect(shape(result)?.filter(m => m[1] === "now").map(m => m[0])).toEqual(["c-rist", "c-ape"]);
    });
});
