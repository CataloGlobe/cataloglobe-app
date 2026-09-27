import type { Page } from "@playwright/test";
import { TENANT_ID } from "./reservationsStub";
import { stubRest, type RestStub, type Row, type Tables } from "./restStub";
import { appearanceTables, freezeClock, sediOf } from "./appearanceStub";

/**
 * Dati finti per l'e2e di Storie (lotto `ds-5-stili-storie-evidenza`, P0).
 *
 * Storie e prodotti rispondono da qui (`restStub.ts`: scritture intercettate,
 * 500 per quelle non registrate); il cappello (`tenants.story_*`) da una rotta
 * sua, che lascia passare ogni altra lettura di `tenants`. Permessi, azienda e
 * sidebar restano veri.
 *
 * Dove appaiono (§50.13, niente regole): il forno su tutte le sedi, la brigata
 * solo a Centro e2e, Natale da nessuna parte (bozza). Le sedi da
 * `appearanceStub.ts`.
 */

export { TENANT_ID };

const uuid = (n: number) => `e2e57000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const CREATED = "2026-03-17T10:00:00.000Z";

export const STORY = { forno: uuid(1), brigata: uuid(2), natale: uuid(3) } as const;
export const MISSING_STORY = uuid(999);
export const PRODUCT = { segale: uuid(101), focaccia: uuid(102) } as const;
export const { SEDE } = sediOf("e2e57000");

function story(id: string, title: string, extra: Row = {}): Row {
    return {
        id,
        tenant_id: TENANT_ID,
        activity_id: null,
        eyebrow: null,
        title,
        cover_media: null,
        body_blocks: [],
        product_id: null,
        sort_order: 0,
        status: "published",
        created_at: CREATED,
        updated_at: CREATED,
        ...extra
    };
}

function makeTables(): Tables {
    return {
        stories: [
            story(STORY.forno, "Il nostro forno e2e", {
                eyebrow: "Dal 1987",
                sort_order: 1,
                body_blocks: [
                    { id: "b1", type: "text", content: "Nel 1987 mio nonno comprò un forno a legna." },
                    { id: "b2", type: "quote", content: "Il pane buono ha bisogno di tempo.", attribution: "Gianni" }
                ]
            }),
            story(STORY.brigata, "La brigata e2e", { sort_order: 2, product_id: PRODUCT.segale, activity_id: SEDE.centro }),
            story(STORY.natale, "Natale e2e", { sort_order: 3, status: "draft" })
        ],
        products: [
            { id: PRODUCT.segale, tenant_id: TENANT_ID, name: "Pane di segale e2e", image_url: null, base_price: 4.5, parent_product_id: null, created_at: CREATED },
            { id: PRODUCT.focaccia, tenant_id: TENANT_ID, name: "Focaccia e2e", image_url: null, base_price: 3, parent_product_id: null, created_at: CREATED }
        ],
        catalog_category_products: [],
        ...appearanceTables("e2e57000", [])
    };
}

export const BRAND = {
    story_cover: null,
    story_title: "La nostra storia e2e",
    story_intro: "Tre generazioni dietro lo stesso bancone.",
    website: "https://example.com"
};

export type { WriteCall, WriteHandler } from "./restStub";
export type StorieStub = RestStub & { tables: Tables; brand: typeof BRAND };

export async function stubStorie(page: Page): Promise<StorieStub> {
    const tables = makeTables();
    const brand = { ...BRAND };
    const stub = await stubRest(page, {
        tables,
        enrich: (table, rows, params) => {
            const select = params.get("select") ?? "";
            if (table === "stories" && select.includes("product:")) {
                return rows
                    .map(row => {
                        const product = tables.products.find(p => p.id === row.product_id);
                        return { ...row, product: product ? { id: product.id, name: product.name } : null };
                    })
                    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
            }
            return rows;
        }
    });
    // Il cappello: solo la lettura delle colonne `story_*`, il resto di `tenants` è vero.
    await page.route(/\/rest\/v1\/tenants\?/, route => {
        const url = new URL(route.request().url());
        if (route.request().method() !== "GET" || !(url.searchParams.get("select") ?? "").includes("story_title")) {
            return route.fallback();
        }
        return route.fulfill({ json: brand });
    });
    await page.route(/\/api\/public-catalog\/revalidate/, route => route.fulfill({ json: { ok: true } }));
    await freezeClock(page);
    return Object.assign(stub, { tables, brand });
}
