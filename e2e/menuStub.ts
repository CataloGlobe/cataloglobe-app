import type { Page } from "@playwright/test";
import { TENANT_ID } from "./reservationsStub";
import { stubRest, type RestStub, type Row, type Tables } from "./restStub";
import { appearanceTables, enrichAppearance, freezeClock, sediOf } from "./appearanceStub";

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
 *
 * Dove è attivo (§50.13, `appearanceStub.ts`, orologio mercoledì 12:00):
 *
 * | Regola | Menù | Stile | Dove | Quando | Alle 12 |
 * |---|---|---|---|---|---|
 * | Pranzo Centro e2e | Carta | Estate | Centro | Lun–Ven 11–15 | in onda |
 * | Sera Porto e2e | Carta | Estate | Porto | 18–21 | fuori finestra |
 * | Pranzo feriale | Pranzo | Base | Lago (sospesa) | sempre | sede sospesa |
 *
 * «Vuoto e2e» non ha regole. Con `{ extraMenu: true }` un quarto menù,
 * «Aperitivo e2e», con il Prosecco: il Prosecco è «in 2 menù».
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
export const EXTRA_MENU = uuid(4);
export const { SEDE } = sediOf("e2e0c000");
export const RULE = { pranzoFeriale: uuid(601), pranzoCentro: uuid(611), seraPorto: uuid(612) } as const;
export const STYLE = { estate: uuid(701), base: uuid(702) } as const;


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

function makeTables(extraMenu: boolean): Tables {
    const base = products();
    const extraLink: Row = {
        id: uuid(399),
        tenant_id: TENANT_ID,
        catalog_id: EXTRA_MENU,
        category_id: uuid(109),
        product_id: PRODUCT.prosecco,
        variant_product_id: null,
        sort_order: 10,
        created_at: CREATED
    };
    const style = (id: string, name: string, n: number): Row => ({
        id,
        tenant_id: TENANT_ID,
        name,
        is_system: false,
        is_active: true,
        current_version_id: uuid(710 + n),
        created_at: CREATED,
        updated_at: CREATED
    });
    return {
        catalogs: [
            ...catalogs(),
            ...(extraMenu ? [{ id: EXTRA_MENU, tenant_id: TENANT_ID, name: "Aperitivo e2e", created_at: "2026-03-14T10:00:00.000Z" }] : [])
        ],
        catalog_categories: [
            ...categories(),
            ...(extraMenu
                ? [{ id: uuid(109), tenant_id: TENANT_ID, catalog_id: EXTRA_MENU, name: "Bollicine", level: 1, parent_category_id: null, sort_order: 0, created_at: CREATED }]
                : [])
        ],
        catalog_category_products: [...links(), ...(extraMenu ? [extraLink] : [])],
        styles: [style(STYLE.estate, "Estate e2e", 1), style(STYLE.base, "Base e2e", 2)],
        style_versions: [
            { id: uuid(711), tenant_id: TENANT_ID, style_id: STYLE.estate, version: 3, config: { colors: { primary: "#f59e0b", pageBackground: "#ffffff" } }, created_at: CREATED },
            { id: uuid(712), tenant_id: TENANT_ID, style_id: STYLE.base, version: 1, config: { colors: { primary: "#6366f1", pageBackground: "#ffffff" } }, created_at: CREATED }
        ],
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
        // «Pranzo e2e» è puntato da una regola di layout: non si elimina.
        ...appearanceTables("e2e0c000", [
            { id: RULE.pranzoCentro, name: "Pranzo Centro e2e", rule_type: "layout", catalog_id: MENU.carta, style_id: STYLE.estate, activities: [SEDE.centro], time_mode: "window", days_of_week: [1, 2, 3, 4, 5], time_from: "11:00:00", time_to: "15:00:00" },
            { id: RULE.seraPorto, name: "Sera Porto e2e", rule_type: "layout", catalog_id: MENU.carta, style_id: STYLE.estate, activities: [SEDE.porto], time_mode: "window", time_from: "18:00:00", time_to: "21:00:00" },
            { id: RULE.pranzoFeriale, name: "Pranzo feriale", rule_type: "layout", catalog_id: MENU.pranzo, style_id: STYLE.base, activities: [SEDE.lago] }
        ])
    };
}

export type { WriteCall, WriteHandler } from "./restStub";
export type MenuStub = RestStub;

export async function stubMenu(page: Page, options: { extraMenu?: boolean } = {}): Promise<MenuStub> {
    const tables = makeTables(Boolean(options.extraMenu));
    const stub = await stubRest(page, {
        tables,
        enrich: (table, rows, params) => {
            const select = params.get("select") ?? "";
            if (table === "products" && select.includes("variants")) {
                return rows.map(row => ({ ...row, variants: tables.products.filter(v => v.parent_product_id === row.id) }));
            }
            if (table === "styles" && select.includes("current_version")) {
                return rows.map(row => ({ ...row, current_version: tables.style_versions.find(v => v.id === row.current_version_id) ?? null }));
            }
            return enrichAppearance(tables, table, rows, params) ?? rows;
        }
    });
    await freezeClock(page);
    await page.route(/\/api\/public-catalog\/revalidate/, route => route.fulfill({ json: { ok: true } }));
    return stub;
}

/** Il collegamento finto di un prodotto in una categoria, per i test che lo tolgono. */
export function linkOf(categoryId: string, productId: string): string {
    const row = links().find(l => l.category_id === categoryId && l.product_id === productId && l.variant_product_id === null);
    if (!row) throw new Error("collegamento non trovato nello stub");
    return String(row.id);
}
