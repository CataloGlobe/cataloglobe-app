import type { Page, Route } from "@playwright/test";
import { TENANT_ID } from "./reservationsStub";

/**
 * Dati finti per l'e2e di Menù (lotto `ds-5-menu`, passo 2 P0).
 *
 * I menù di staging dell'azienda di test sono dati che chiunque sposta a mano
 * (§47.2, apertura 1): qui le letture delle tabelle del menù e dei prodotti
 * rispondono da questi elenchi, filtrati come farebbe PostgREST sui parametri
 * che le pagine usano. Permessi, azienda e sidebar restano veri.
 *
 * Le scritture non partono mai. POST, PATCH e DELETE su qualunque tabella, le
 * RPC che non leggono, le edge function e la rivalidazione del menù pubblico
 * sono intercettate: chi prova un gesto registra una risposta con `onWrite`
 * («tabella.METODO») e controlla corpo e filtri (test di cablaggio). Un gesto
 * senza risposta registrata riceve 500, come un server rotto.
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

type Row = Record<string, unknown>;

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

type Tables = Record<string, Row[]>;

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

/** Il sottoinsieme dei filtri PostgREST che le pagine del menù usano. */
function matches(row: Row, params: URLSearchParams): boolean {
    for (const [key, raw] of params) {
        if (["select", "order", "limit", "offset", "or", "and"].includes(key) || key.includes(".")) continue;
        const dot = raw.indexOf(".");
        const op = raw.slice(0, dot);
        const value = raw.slice(dot + 1);
        const field = row[key];
        const text = field === null || field === undefined ? null : String(field);
        if (op === "eq" && text !== value) return false;
        if (op === "neq" && text === value) return false;
        if (op === "is" && !(value === "null" ? text === null : text === value)) return false;
        if (op === "in" && !value.replace(/[()"]/g, "").split(",").includes(text ?? "")) return false;
    }
    return true;
}

export type WriteCall = { key: string; params: URLSearchParams; body: unknown };
export type WriteHandler = (call: WriteCall) => unknown;

export type MenuStub = {
    /** Ogni scrittura intercettata, in ordine («tabella.METODO», filtri, corpo). */
    writes: WriteCall[];
    /** Registra la risposta finta di una scrittura (test di cablaggio). */
    onWrite: (key: string, handler: WriteHandler) => void;
    /**
     * Toglie un permesso dalla risposta vera di `get_my_permissions`. Risolve
     * `revoked` alla prima risposta riscritta: prima di allora le azioni sono
     * nascoste comunque (permessi in caricamento), e un «non c'è» passerebbe
     * senza aver provato niente.
     */
    revoke: (permission: string) => Promise<void>;
    revoked: Promise<void>;
};

export async function stubMenu(page: Page): Promise<MenuStub> {
    const tables = makeTables();
    const handlers = new Map<string, WriteHandler>();
    let markRevoked: () => void = () => {};
    const revoked = new Promise<void>(resolve => {
        markRevoked = resolve;
    });
    const stub: MenuStub = {
        writes: [],
        onWrite: (key, handler) => handlers.set(key, handler),
        revoked,
        revoke: async permission => {
            await page.route(/\/rest\/v1\/rpc\/get_my_permissions/, async route => {
                try {
                    const response = await route.fetch();
                    const rows = (await response.json()) as Array<{ permissions: string[] | null }>;
                    for (const row of rows) row.permissions = (row.permissions ?? []).filter(p => p !== permission);
                    await route.fulfill({ response, json: rows });
                    markRevoked();
                } catch {
                    // Pagina chiusa a metà richiesta (fine del test): niente da riscrivere.
                }
            });
        }
    };

    async function intercept(route: Route, key: string) {
        const request = route.request();
        const params = new URL(request.url()).searchParams;
        const body = request.postData() ? (request.postDataJSON() as unknown) : null;
        const call = { key, params, body };
        stub.writes.push(call);
        const handler = handlers.get(key);
        if (!handler) {
            return route.fulfill({ status: 500, json: { code: "E2E", message: `${key} non prevista dall'e2e` } });
        }
        const json = handler(call);
        if (json === undefined || json === null) return route.fulfill({ status: 204, body: "" });
        await route.fulfill({ status: request.method() === "POST" ? 201 : 200, json });
    }

    // Registrata per prima: Playwright prova le rotte dall'ultima, quindi
    // questa è la rete sotto tutte le altre. Ogni scrittura su una tabella
    // qualunque (traduzioni, code di lavoro…) passa di qui.
    await page.route("**/rest/v1/**", route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        const table = path.split("/rest/v1/")[1] ?? "";
        if (table.startsWith("rpc/")) {
            const fn = table.slice(4);
            return /^(get|is|has|can)_/.test(fn) ? route.fallback() : intercept(route, `rpc.${fn}`);
        }
        if (request.method() === "GET" || request.method() === "HEAD") return route.fallback();
        return intercept(route, `${table}.${request.method()}`);
    });

    for (const table of Object.keys(tables)) {
        await page.route(new RegExp(`/rest/v1/${table}(\\?|$)`), async route => {
            const request = route.request();
            if (request.method() !== "GET") return intercept(route, `${table}.${request.method()}`);
            const params = new URL(request.url()).searchParams;
            let rows = tables[table].filter(row => matches(row, params));
            if (table === "products" && (params.get("select") ?? "").includes("variants")) {
                rows = rows.map(row => ({
                    ...row,
                    variants: tables.products.filter(v => v.parent_product_id === row.id)
                }));
            }
            const wantsObject = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object");
            if (!wantsObject) return route.fulfill({ json: rows });
            if (rows.length !== 1) {
                return route.fulfill({
                    status: 406,
                    json: { code: "PGRST116", details: `The result contains ${rows.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" }
                });
            }
            return route.fulfill({ json: rows[0] });
        });
    }

    await page.route(/\/functions\/v1\//, route => intercept(route, `fn.${new URL(route.request().url()).pathname.split("/").pop()}`));
    await page.route(/\/api\/public-catalog\/revalidate/, route => route.fulfill({ json: { ok: true } }));

    return stub;
}

/** Il collegamento finto di un prodotto in una categoria, per i test che lo tolgono. */
export function linkOf(categoryId: string, productId: string): string {
    const row = links().find(l => l.category_id === categoryId && l.product_id === productId && l.variant_product_id === null);
    if (!row) throw new Error("collegamento non trovato nello stub");
    return String(row.id);
}
