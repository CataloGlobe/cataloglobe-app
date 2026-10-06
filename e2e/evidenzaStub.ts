import type { Page } from "@playwright/test";
import { TENANT_ID } from "./reservationsStub";
import { stubRest, type RestStub, type Row, type Tables } from "./restStub";
import { appearanceTables, enrichAppearance, freezeClock, sediOf } from "./appearanceStub";

/**
 * Dati finti per l'e2e di In evidenza (lotto `ds-5-stili-storie-evidenza`, P0).
 *
 * Contenuti, prodotti collegati, prodotti e regole che li nominano rispondono
 * da qui (`restStub.ts`: scritture intercettate, 500 per quelle non
 * registrate). Permessi, azienda e sidebar restano veri. `onWrite` di default
 * per le code di traduzione e le loro pulizie: il servizio le chiama in
 * silenzio dopo ogni scrittura di testo.
 *
 * Dove e quando compaiono (§50.13, `appearanceStub.ts`, orologio mercoledì 12:00):
 *
 * | Regola | Contenuto | Posto | Dove | Quando | Stato |
 * |---|---|---|---|---|---|
 * | Coppia sempre e2e | coppia | sopra il menù | tutte | sempre | in onda |
 * | Giovedì sera e2e | aperitivo | sotto il menù | Centro | Gio 17–20 | spenta |
 *
 * Chiusura e concerto: nessuna regola. «Nessuna regola li mostra»: 3.
 */

export { TENANT_ID };

const uuid = (n: number) => `e2eef000-0000-4000-a000-${String(n).padStart(12, "0")}`;

export const FEATURED = { coppia: uuid(1), aperitivo: uuid(2), chiusura: uuid(3), concerto: uuid(4) } as const;
export const MISSING_FEATURED = uuid(999);
export const PRODUCT = { bigArch: uuid(101), patatine: uuid(102), spritz: uuid(103), tagliere: uuid(104) } as const;
const LINK = { coppiaBig: uuid(201), coppiaPatatine: uuid(202), aperitivoSpritz: uuid(203) } as const;
export const RULE = { aperitivo: uuid(401), coppia: uuid(402) } as const;
export const { SEDE } = sediOf("e2eef000");

function content(id: string, n: number, internal: string, title: string, type: string, extra: Row = {}): Row {
    const pricing = type === "promo" ? "per_item" : type === "bundle" ? "bundle" : "none";
    return {
        id,
        tenant_id: TENANT_ID,
        internal_name: internal,
        title,
        subtitle: null,
        description: null,
        media_id: null,
        media_focal_x: 50,
        media_focal_y: 50,
        media_zoom: 1,
        media_fill_mode: "blur",
        media_fill_color: null,
        media_aspect_ratio: null,
        cta_text: null,
        cta_url: null,
        status: "published",
        layout_style: null,
        pricing_mode: pricing,
        content_type: type,
        bundle_price: null,
        show_original_total: false,
        created_at: `2026-03-${String(20 - n).padStart(2, "0")}T10:00:00.000Z`,
        updated_at: "2026-03-20T10:00:00.000Z",
        ...extra
    };
}

function makeTables(): Tables {
    const product = (id: string, name: string, base_price: number | null): Row => ({
        id,
        tenant_id: TENANT_ID,
        name,
        description: null,
        base_price,
        parent_product_id: null,
        created_at: "2026-03-01T10:00:00.000Z"
    });
    const link = (id: string, featured: string, productId: string, sort: number, note: string | null): Row => ({
        id,
        tenant_id: TENANT_ID,
        featured_content_id: featured,
        product_id: productId,
        sort_order: sort,
        note,
        created_at: "2026-03-01T10:00:00.000Z"
    });
    return {
        featured_contents: [
            content(FEATURED.coppia, 1, "Menu di coppia e2e", "Menu coppia", "bundle", {
                subtitle: "Due portate e una bottiglia",
                bundle_price: 25,
                show_original_total: true
            }),
            content(FEATURED.aperitivo, 2, "Aperitivo giovedì e2e", "Tagliere + 2 drink", "promo"),
            content(FEATURED.chiusura, 3, "Chiusura ferragosto e2e", "Siamo chiusi il 15 agosto", "announcement"),
            content(FEATURED.concerto, 4, "Concerto e2e", "Live acustico", "event", { cta_text: "Prenota", cta_url: "https://example.com" })
        ],
        featured_content_products: [
            link(LINK.coppiaBig, FEATURED.coppia, PRODUCT.bigArch, 1, "la scelta più richiesta"),
            link(LINK.coppiaPatatine, FEATURED.coppia, PRODUCT.patatine, 2, null),
            link(LINK.aperitivoSpritz, FEATURED.aperitivo, PRODUCT.spritz, 1, null)
        ],
        products: [
            product(PRODUCT.bigArch, "Big Arch e2e", 7.9),
            product(PRODUCT.patatine, "Patatine medie e2e", 3.2),
            product(PRODUCT.spritz, "Spritz e2e", 6),
            product(PRODUCT.tagliere, "Tagliere e2e", 12)
        ],
        product_groups: [],
        product_group_items: [],
        product_option_groups: [],
        // L'aperitivo è nominato da una regola, spenta; la coppia da una viva.
        ...appearanceTables("e2eef000", [
            { id: RULE.coppia, name: "Coppia sempre e2e", rule_type: "featured", all: true, featured: [{ id: FEATURED.coppia, slot: "before_catalog" }] },
            {
                id: RULE.aperitivo,
                name: "Giovedì sera e2e",
                rule_type: "featured",
                enabled: false,
                activities: [SEDE.centro],
                time_mode: "window",
                days_of_week: [4],
                time_from: "17:00:00",
                time_to: "20:00:00",
                featured: [{ id: FEATURED.aperitivo, slot: "after_catalog" }]
            }
        ])
    };
}

export { LINK };
export type { WriteCall, WriteHandler } from "./restStub";
export type EvidenzaStub = RestStub & { tables: Tables };

export async function stubEvidenza(page: Page): Promise<EvidenzaStub> {
    const tables = makeTables();
    const productEmbed = (id: unknown) => {
        const p = tables.products.find(row => row.id === id);
        return p ? { ...p, option_groups: [] } : null;
    };
    const stub = await stubRest(page, {
        tables,
        enrich: (table, rows, params) => {
            const select = params.get("select") ?? "";
            if (table === "featured_contents" && select.includes("featured_content_products")) {
                return rows.map(row => ({
                    ...row,
                    products: [{ count: tables.featured_content_products.filter(l => l.featured_content_id === row.id).length }]
                }));
            }
            if (table === "featured_content_products" && select.includes("products")) {
                return rows
                    .map((row): Row => ({ ...row, products: productEmbed(row.product_id), product: productEmbed(row.product_id) }))
                    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
            }
            if (table === "products" && select.includes("option_groups")) {
                return rows.map(row => ({ ...row, option_groups: [] }));
            }
            return enrichAppearance(tables, table, rows, params) ?? rows;
        }
    });
    for (const key of ["translation_jobs.POST", "translation_jobs.PATCH", "translation_jobs.DELETE", "translations.DELETE"]) {
        stub.onWrite(key, () => null);
    }
    await page.route(/\/api\/public-catalog\/revalidate/, route => route.fulfill({ json: { ok: true } }));
    await freezeClock(page);
    return Object.assign(stub, { tables });
}
