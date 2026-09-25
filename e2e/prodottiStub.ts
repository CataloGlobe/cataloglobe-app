import type { Page } from "@playwright/test";
import { TENANT_ID } from "./reservationsStub";
import { stubRest, type RestStub, type Row, type Tables } from "./restStub";

/**
 * Dati finti per l'e2e di Prodotti (lotto `ds-5-prodotti`, P0).
 *
 * Prodotti, gruppi, ingredienti, attributi, menù e collegamenti rispondono da
 * questi elenchi (`restStub.ts`: scritture intercettate, 500 per quelle non
 * registrate). Permessi, azienda, sidebar, allergeni e caratteristiche di
 * piattaforma restano veri. `vertical: "retail"` riscrive il verticale
 * dell'azienda letto da `user_tenants_view`, per le pagine del negozio.
 */

export { TENANT_ID };

const uuid = (n: number) => `e2e0d000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const CREATED = "2026-03-17T10:00:00.000Z";

export const PRODUCT = {
    hamburger: uuid(1),
    cheeseburger: uuid(2),
    patatine: uuid(3),
    cocaCola: uuid(4),
    cocaZero: uuid(41),
    cocaLight: uuid(42),
    insalatona: uuid(5),
    muffin: uuid(6),
    mcflurry: uuid(7),
    acqua: uuid(8),
    caffe: uuid(9),
    tiramisu: uuid(10),
    nuggets: uuid(11),
    toast: uuid(12)
} as const;
export const MISSING_PRODUCT = uuid(999);

export const MENU = { carta: uuid(101), pranzo: uuid(102) } as const;
const CAT = { panini: uuid(111), contorni: uuid(112), bevande: uuid(113), dolci: uuid(114), primi: uuid(115) } as const;

export const GROUP = { panini: uuid(201), manzo: uuid(202), contorni: uuid(203), bevande: uuid(204) } as const;
export const INGREDIENT = { pane: uuid(301), carne: uuid(302), cipolla: uuid(303) } as const;
export const ATTRIBUTE = { taglia: uuid(401), colore: uuid(402), materiale: uuid(403) } as const;
const FORMATS = uuid(501);

type StubProduct = {
    id: string;
    name: string;
    base_price: number | null;
    description?: string | null;
    notes?: Array<{ label: string; value: string }>;
    variants?: StubProduct[];
    created: string;
};

function products(): StubProduct[] {
    // `created_at` decrescente = ordine dell'elenco (più recente in alto).
    const at = (i: number) => `2026-03-${String(20 - i).padStart(2, "0")}T10:00:00.000Z`;
    return [
        {
            id: PRODUCT.hamburger,
            name: "Hamburger",
            base_price: 2.9,
            description: "Carne 100% bovino, cetriolo, senape, ketchup, cipolla.",
            notes: [{ label: "Provenienza", value: "Carne italiana 100%" }],
            created: at(0)
        },
        { id: PRODUCT.cheeseburger, name: "Cheeseburger", base_price: 3.5, created: at(1) },
        { id: PRODUCT.patatine, name: "Patatine", base_price: null, created: at(2) },
        {
            id: PRODUCT.cocaCola,
            name: "Coca-Cola",
            base_price: 2.5,
            created: at(3),
            variants: [
                { id: PRODUCT.cocaZero, name: "Coca-Cola Zero", base_price: null, created: at(3) },
                { id: PRODUCT.cocaLight, name: "Coca-Cola Light", base_price: 2.7, created: at(3) }
            ]
        },
        { id: PRODUCT.insalatona, name: "Insalatona", base_price: null, created: at(4) },
        { id: PRODUCT.muffin, name: "Muffin al cioccolato", base_price: 2.2, created: at(5) },
        { id: PRODUCT.mcflurry, name: "McFlurry", base_price: 3.5, created: at(6) },
        { id: PRODUCT.acqua, name: "Acqua naturale", base_price: 1.5, created: at(7) },
        { id: PRODUCT.caffe, name: "Caffè", base_price: 1.2, created: at(8) },
        { id: PRODUCT.tiramisu, name: "Tiramisù", base_price: 4, created: at(9) },
        { id: PRODUCT.nuggets, name: "Chicken Nuggets", base_price: 4.5, created: at(10) },
        { id: PRODUCT.toast, name: "McToast", base_price: 2.9, created: at(11) }
    ];
}

function productRow(p: StubProduct, parent: string | null): Row {
    return {
        id: p.id,
        tenant_id: TENANT_ID,
        name: p.name,
        description: p.description ?? null,
        base_price: p.base_price,
        parent_product_id: parent,
        image_url: null,
        image_framing: null,
        image_aspect_ratio: null,
        product_type: p.variants ? "configurable" : p.id === PRODUCT.patatine ? "formats" : "simple",
        notes: p.notes ?? [],
        created_at: p.created,
        updated_at: p.created
    };
}

function catalogRows(): Tables {
    const cat = (id: string, catalog_id: string, name: string, sort_order: number): Row => ({
        id,
        tenant_id: TENANT_ID,
        catalog_id,
        name,
        level: 1,
        parent_category_id: null,
        sort_order,
        created_at: CREATED
    });
    let n = 600;
    const l = (catalog_id: string, category_id: string, product_id: string, variant: string | null = null): Row => {
        n += 1;
        return {
            id: uuid(n),
            tenant_id: TENANT_ID,
            catalog_id,
            category_id,
            product_id,
            variant_product_id: variant,
            sort_order: n,
            created_at: CREATED
        };
    };
    return {
        catalogs: [
            { id: MENU.carta, tenant_id: TENANT_ID, name: "Carta e2e", created_at: CREATED },
            { id: MENU.pranzo, tenant_id: TENANT_ID, name: "Pranzo e2e", created_at: CREATED }
        ],
        catalog_categories: [
            cat(CAT.panini, MENU.carta, "Panini", 0),
            cat(CAT.contorni, MENU.carta, "Contorni", 10),
            cat(CAT.bevande, MENU.carta, "Bevande", 20),
            cat(CAT.dolci, MENU.carta, "Dolci", 30),
            cat(CAT.primi, MENU.pranzo, "Panini", 0)
        ],
        // Insalatona e Muffin in nessun menù: «Fuori menù» 2.
        catalog_category_products: [
            l(MENU.carta, CAT.panini, PRODUCT.hamburger),
            l(MENU.pranzo, CAT.primi, PRODUCT.hamburger),
            l(MENU.carta, CAT.panini, PRODUCT.cheeseburger),
            l(MENU.carta, CAT.contorni, PRODUCT.patatine),
            l(MENU.pranzo, CAT.primi, PRODUCT.patatine),
            l(MENU.carta, CAT.bevande, PRODUCT.cocaCola),
            l(MENU.carta, CAT.bevande, PRODUCT.cocaCola, PRODUCT.cocaZero),
            l(MENU.carta, CAT.bevande, PRODUCT.cocaCola, PRODUCT.cocaLight),
            l(MENU.carta, CAT.dolci, PRODUCT.mcflurry),
            l(MENU.carta, CAT.bevande, PRODUCT.acqua),
            l(MENU.carta, CAT.bevande, PRODUCT.caffe),
            l(MENU.carta, CAT.dolci, PRODUCT.tiramisu),
            l(MENU.carta, CAT.panini, PRODUCT.nuggets),
            l(MENU.carta, CAT.panini, PRODUCT.toast)
        ]
    };
}

function makeTables(): Tables {
    const base = products();
    const groupItem = (n: number, group_id: string, product_id: string): Row => ({
        id: uuid(n),
        tenant_id: TENANT_ID,
        group_id,
        product_id,
        created_at: CREATED
    });
    const group = (id: string, name: string, parent: string | null): Row => ({
        id,
        tenant_id: TENANT_ID,
        name,
        parent_group_id: parent,
        created_at: CREATED,
        updated_at: CREATED
    });
    const def = (id: string, label: string, type: string, extra: Row = {}): Row => ({
        id,
        tenant_id: TENANT_ID,
        code: label.toLowerCase(),
        label,
        type,
        options: null,
        is_required: false,
        show_in_public_channels: true,
        vertical: null,
        created_at: CREATED,
        ...extra
    });
    return {
        ...catalogRows(),
        products: base.flatMap(p => [productRow(p, null), ...(p.variants ?? []).map(v => productRow(v, p.id))]),
        // Patatine: tre formati, «da 2,50 €».
        product_option_groups: [
            {
                id: FORMATS,
                tenant_id: TENANT_ID,
                product_id: PRODUCT.patatine,
                name: "Formato",
                group_kind: "PRIMARY_PRICE",
                pricing_mode: "ABSOLUTE",
                is_required: true,
                max_selectable: 1,
                sort_order: 0,
                created_at: CREATED
            }
        ],
        product_option_values: [
            { id: uuid(511), tenant_id: TENANT_ID, option_group_id: FORMATS, name: "Piccole", absolute_price: 2.5, price_modifier: null, sort_order: 0, created_at: CREATED },
            { id: uuid(512), tenant_id: TENANT_ID, option_group_id: FORMATS, name: "Medie", absolute_price: 3.2, price_modifier: null, sort_order: 1, created_at: CREATED },
            { id: uuid(513), tenant_id: TENANT_ID, option_group_id: FORMATS, name: "Grandi", absolute_price: 3.9, price_modifier: null, sort_order: 2, created_at: CREATED }
        ],
        product_groups: [
            group(GROUP.panini, "Panini e2e", null),
            group(GROUP.manzo, "Manzo e2e", GROUP.panini),
            group(GROUP.contorni, "Contorni e2e", null),
            group(GROUP.bevande, "Bevande e2e", null)
        ],
        product_group_items: [
            groupItem(211, GROUP.panini, PRODUCT.hamburger),
            groupItem(212, GROUP.panini, PRODUCT.cheeseburger),
            groupItem(213, GROUP.manzo, PRODUCT.hamburger),
            groupItem(214, GROUP.contorni, PRODUCT.patatine)
        ],
        ingredients: [
            { id: INGREDIENT.pane, tenant_id: TENANT_ID, name: "Pane", created_at: CREATED },
            { id: INGREDIENT.carne, tenant_id: TENANT_ID, name: "Carne bovina", created_at: CREATED },
            { id: INGREDIENT.cipolla, tenant_id: TENANT_ID, name: "Cipolla", created_at: CREATED }
        ],
        product_ingredients: [
            { id: uuid(311), tenant_id: TENANT_ID, product_id: PRODUCT.hamburger, ingredient_id: INGREDIENT.pane, sort_order: 0 },
            { id: uuid(312), tenant_id: TENANT_ID, product_id: PRODUCT.hamburger, ingredient_id: INGREDIENT.carne, sort_order: 1 },
            { id: uuid(313), tenant_id: TENANT_ID, product_id: PRODUCT.cheeseburger, ingredient_id: INGREDIENT.carne, sort_order: 0 }
        ],
        product_allergens: [],
        product_characteristic_assignments: [],
        product_pairings: [],
        product_attribute_definitions: [
            def(ATTRIBUTE.materiale, "Materiale", "text", { tenant_id: null, vertical: "retail", show_in_public_channels: false }),
            def(ATTRIBUTE.taglia, "Taglia", "text", { is_required: true }),
            def(ATTRIBUTE.colore, "Colore", "text")
        ],
        // Hamburger (nel negozio): «Taglia» M, «Colore» assegnato e vuoto.
        product_attribute_values: [
            { id: uuid(451), tenant_id: TENANT_ID, product_id: PRODUCT.hamburger, attribute_definition_id: ATTRIBUTE.taglia, value_text: "M", value_number: null, value_boolean: null, value_json: null },
            { id: uuid(452), tenant_id: TENANT_ID, product_id: PRODUCT.hamburger, attribute_definition_id: ATTRIBUTE.colore, value_text: null, value_number: null, value_boolean: null, value_json: null }
        ],
        // «Carta e2e» è usata da una regola di layout.
        schedule_layout: [{ schedule_id: uuid(701), tenant_id: TENANT_ID, catalog_id: MENU.carta }],
        schedules: [{ id: uuid(701), tenant_id: TENANT_ID, name: "Menu weekend e2e", target_type: null, target_id: null, enabled: true }],
        featured_content_products: [],
        schedule_price_overrides: [],
        schedule_visibility_overrides: []
    };
}

export type { WriteCall, WriteHandler } from "./restStub";
export type ProdottiStub = RestStub & { tables: Tables };

export async function stubProdotti(page: Page, options: { vertical?: string } = {}): Promise<ProdottiStub> {
    const tables = makeTables();
    const stub = await stubRest(page, {
        tables,
        enrich: (table, rows, params) => {
            const select = params.get("select") ?? "";
            if (table === "products" && select.includes("variants")) {
                return rows.map(row => ({ ...row, variants: tables.products.filter(v => v.parent_product_id === row.id) }));
            }
            if (table === "product_groups" && select.includes("product_group_items")) {
                return rows.map(row => ({
                    ...row,
                    product_group_items: [{ count: tables.product_group_items.filter(i => i.group_id === row.id).length }]
                }));
            }
            return rows;
        }
    });
    if (options.vertical) {
        const vertical = options.vertical;
        await page.route(/\/rest\/v1\/user_tenants_view/, async route => {
            try {
                const response = await route.fetch();
                const rows = (await response.json()) as Row[] | Row;
                const rewrite = (row: Row) => (row.id === TENANT_ID || row.tenant_id === TENANT_ID ? { ...row, vertical_type: vertical } : row);
                await route.fulfill({ response, json: Array.isArray(rows) ? rows.map(rewrite) : rewrite(rows) });
            } catch {
                // Pagina chiusa a metà richiesta.
            }
        });
    }
    await page.route(/\/api\/public-catalog\/revalidate/, route => route.fulfill({ json: { ok: true } }));
    return Object.assign(stub, { tables });
}
