import type { Page } from "@playwright/test";
import { TENANT_ID } from "./reservationsStub";
import { stubRest, type RestStub, type Row, type Tables } from "./restStub";

/**
 * Dati finti per l'e2e di Menù (lotto `ds-5-menu`, passo 2 P0).
 *
 * I menù di staging dell'azienda di test sono dati che chiunque sposta a mano
 * (§47.2, apertura 1): qui le letture delle tabelle del menù e dei prodotti
 * rispondono da questi elenchi, filtrati come farebbe PostgREST sui parametri
 * che le pagine usano. Permessi, azienda e sidebar restano veri.
 *
 * Le scritture non partono mai: la macchina è in `restStub.ts` (scritture
 * intercettate, 500 per quelle non registrate, `onWrite`, `revoke`); qui in
 * più la rivalidazione del menù pubblico risponde ok.
 */

export { TENANT_ID };

const uuid = (n: number) => `e2e0c000-0000-4000-a000-${String(n).padStart(12, "0")}`;

export const MENU = { carta: uuid(1), pranzo: uuid(2), vuoto: uuid(3) } as const;
export const CAT = {
    antipasti: uuid(101),
    pizze: uuid(102),
    vini: uuid(103),
    bianchi: uuid(104),
    fruttati: uuid(105),
    rossi: uuid(106),
    dessert: uuid(107),
    primi: uuid(108)
} as const;
export const MISSING_MENU = uuid(999);


const CREATED = "2026-03-17T10:00:00.000Z";

function catalogs(): Row[] {
    return [
        { id: MENU.carta, tenant_id: TENANT_ID, name: "Carta e2e", created_at: "2026-03-17T10:00:00.000Z" },
        { id: MENU.pranzo, tenant_id: TENANT_ID, name: "Pranzo e2e", created_at: "2026-03-16T10:00:00.000Z" },
        { id: MENU.vuoto, tenant_id: TENANT_ID, name: "Vuoto e2e", created_at: "2026-03-15T10:00:00.000Z" }
    ];
}

function categories(): Row[] {
    const c = (id: string, catalog_id: string, name: string, level: number, parent: string | null, sort_order: number): Row => ({
        id,
        tenant_id: TENANT_ID,
        catalog_id,
        name,
        level,
        parent_category_id: parent,
        sort_order,
        created_at: CREATED
    });
    return [
        c(CAT.antipasti, MENU.carta, "Antipasti", 1, null, 0),
        c(CAT.pizze, MENU.carta, "Pizze", 1, null, 10),
        c(CAT.vini, MENU.carta, "Vini", 1, null, 20),
        c(CAT.bianchi, MENU.carta, "Bianchi", 2, CAT.vini, 0),
        c(CAT.fruttati, MENU.carta, "Fruttati e aromatici", 3, CAT.bianchi, 0),
        c(CAT.rossi, MENU.carta, "Rossi", 2, CAT.vini, 10),
        c(CAT.dessert, MENU.carta, "Dessert", 1, null, 30),
        c(CAT.primi, MENU.pranzo, "Primi", 1, null, 0)
    ];
}

/** Prodotti base; `variants` è l'embedding di `listBaseProductsWithVariants`. */
type StubProduct = { id: string; name: string; base_price: number | null; variants?: StubProduct[] };

export const PRODUCT = {
    bruschetta: uuid(201),
    tagliere: uuid(202),
    olive: uuid(203),
    frittatine: uuid(204),
    margherita: uuid(205),
    margheritaBaby: uuid(251),
    margheritaMaxi: uuid(252),
    prosecco: uuid(217),
    vermentino: uuid(218),
    moscato: uuid(219),
    chianti: uuid(220),
    tiramisu: uuid(221),
    pannaCotta: uuid(222),
    carbonara: uuid(223)
} as const;

const PIZZE = [
    "Marinara",
    "Diavola",
    "Capricciosa",
    "Quattro formaggi",
    "Bufala",
    "Napoli",
    "Ortolana",
    "Tonno e cipolla",
    "Salsiccia e friarielli",
    "Prosciutto e funghi",
    "Calzone"
];
const pizzaId = (i: number) => uuid(206 + i);

function products(): StubProduct[] {
    return [
        { id: PRODUCT.bruschetta, name: "Bruschetta", base_price: null },
        { id: PRODUCT.tagliere, name: "Tagliere", base_price: null },
        { id: PRODUCT.olive, name: "Olive ascolane", base_price: 5.5 },
        { id: PRODUCT.frittatine, name: "Frittatine", base_price: 4 },
        {
            id: PRODUCT.margherita,
            name: "Margherita",
            base_price: 8,
            variants: [
                { id: PRODUCT.margheritaBaby, name: "Margherita baby", base_price: 6 },
                { id: PRODUCT.margheritaMaxi, name: "Margherita maxi", base_price: 11 }
            ]
        },
        ...PIZZE.map((name, i) => ({ id: pizzaId(i), name, base_price: 7 + (i % 5) })),
        { id: PRODUCT.prosecco, name: "Prosecco", base_price: 5 },
        { id: PRODUCT.vermentino, name: "Vermentino", base_price: 6 },
        { id: PRODUCT.moscato, name: "Moscato", base_price: 5.5 },
        { id: PRODUCT.chianti, name: "Chianti", base_price: 6 },
        { id: PRODUCT.tiramisu, name: "Tiramisù", base_price: 5 },
        { id: PRODUCT.pannaCotta, name: "Panna cotta", base_price: 4.5 },
        { id: PRODUCT.carbonara, name: "Carbonara", base_price: 11 }
    ];
}

function productRow(p: StubProduct, parent: string | null): Row {
    return {
        id: p.id,
        tenant_id: TENANT_ID,
        name: p.name,
        description: null,
        base_price: p.base_price,
        parent_product_id: parent,
        image_url: null,
        image_framing: null,
        image_aspect_ratio: null,
        product_type: "simple",
        notes: [],
        created_at: CREATED,
        updated_at: CREATED
    };
}

function links(): Row[] {
    let n = 300;
    let order = 0;
    const l = (catalog_id: string, category_id: string, product_id: string, variant: string | null = null): Row => {
        n += 1;
        order += 10;
        return {
            id: uuid(n),
            tenant_id: TENANT_ID,
            catalog_id,
            category_id,
            product_id,
            variant_product_id: variant,
            sort_order: order,
            created_at: CREATED
        };
    };
    return [
        l(MENU.carta, CAT.antipasti, PRODUCT.bruschetta),
        l(MENU.carta, CAT.antipasti, PRODUCT.tagliere),
        l(MENU.carta, CAT.antipasti, PRODUCT.olive),
        l(MENU.carta, CAT.antipasti, PRODUCT.frittatine),
        l(MENU.carta, CAT.pizze, PRODUCT.margherita),
        l(MENU.carta, CAT.pizze, PRODUCT.margherita, PRODUCT.margheritaBaby),
        l(MENU.carta, CAT.pizze, PRODUCT.margherita, PRODUCT.margheritaMaxi),
        ...PIZZE.map((_, i) => l(MENU.carta, CAT.pizze, pizzaId(i))),
        l(MENU.carta, CAT.vini, PRODUCT.prosecco),
        l(MENU.carta, CAT.bianchi, PRODUCT.vermentino),
        l(MENU.carta, CAT.fruttati, PRODUCT.moscato),
        l(MENU.carta, CAT.rossi, PRODUCT.chianti),
        l(MENU.pranzo, CAT.primi, PRODUCT.carbonara)
    ];
}

const SKU_DEF = uuid(401);
const FORMAT_GROUP = uuid(402);

function makeTables(): Tables {
    const base = products();
    return {
        catalogs: catalogs(),
        catalog_categories: categories(),
        catalog_category_products: links(),
        products: base.flatMap(p => [productRow(p, null), ...(p.variants ?? []).map(v => productRow(v, p.id))]),
        product_option_groups: [{ id: FORMAT_GROUP, tenant_id: TENANT_ID, product_id: PRODUCT.tagliere, group_kind: "PRIMARY_PRICE" }],
        product_option_values: [
            { id: uuid(403), tenant_id: TENANT_ID, option_group_id: FORMAT_GROUP, absolute_price: 8 },
            { id: uuid(404), tenant_id: TENANT_ID, option_group_id: FORMAT_GROUP, absolute_price: 12 }
        ],
        product_groups: [{ id: uuid(501), tenant_id: TENANT_ID, name: "Dolci", created_at: CREATED, product_group_items: [{ count: 2 }] }],
        product_group_items: [
            { id: uuid(502), tenant_id: TENANT_ID, group_id: uuid(501), product_id: PRODUCT.tiramisu },
            { id: uuid(503), tenant_id: TENANT_ID, group_id: uuid(501), product_id: PRODUCT.pannaCotta }
        ],
        product_attribute_definitions: [
            { id: SKU_DEF, tenant_id: TENANT_ID, code: "sku", label: "Codice", type: "text", vertical: null, created_at: CREATED }
        ],
        product_attribute_values: [
            { id: uuid(405), tenant_id: TENANT_ID, product_id: PRODUCT.olive, attribute_definition_id: SKU_DEF, value_text: "ANT-003" }
        ],
        // «Pranzo e2e» è puntato da una regola di layout attiva: non si elimina.
        schedule_layout: [
            {
                schedule_id: uuid(601),
                tenant_id: TENANT_ID,
                catalog_id: MENU.pranzo,
                schedule: { id: uuid(601), name: "Pranzo feriale", enabled: true, start_at: null, end_at: null, tenant_id: TENANT_ID }
            }
        ]
    };
}

export type { WriteCall, WriteHandler } from "./restStub";
export type MenuStub = RestStub;

export async function stubMenu(page: Page): Promise<MenuStub> {
    const tables = makeTables();
    const stub = await stubRest(page, {
        tables,
        enrich: (table, rows, params) =>
            table === "products" && (params.get("select") ?? "").includes("variants")
                ? rows.map(row => ({ ...row, variants: tables.products.filter(v => v.parent_product_id === row.id) }))
                : rows
    });
    await page.route(/\/api\/public-catalog\/revalidate/, route => route.fulfill({ json: { ok: true } }));
    return stub;
}

/** Il collegamento finto di un prodotto in una categoria, per i test che lo tolgono. */
export function linkOf(categoryId: string, productId: string): string {
    const row = links().find(l => l.category_id === categoryId && l.product_id === productId && l.variant_product_id === null);
    if (!row) throw new Error("collegamento non trovato nello stub");
    return String(row.id);
}
