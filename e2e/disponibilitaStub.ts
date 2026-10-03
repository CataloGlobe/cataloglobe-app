import type { Page } from "@playwright/test";
import { TENANT_ID } from "./reservationsStub";
import { stubRest, type RestStub, type Row, type Tables } from "./restStub";
import { enrichAppearance, freezeClock } from "./appearanceStub";

/**
 * Dati finti per l'e2e di Disponibilità (lotto `ds-5-coda`, P0).
 *
 * La sede è **vera** (la prima della griglia di Sedi: la scheda carica
 * anagrafica, orari e stato dal server); regola, menù, modifiche a mano e
 * ingredienti sono finti. Una regola layout «su tutte le sedi» porta il Menù
 * e2e, quindi vale per qualunque sede; le modifiche a mano si scrivono sulla
 * sede aperta (`activityId`, noto solo a runtime).
 *
 * | Prodotto | Categoria | Prezzo | Oggi |
 * |---|---|---|---|
 * | Big e2e | Panini | 7,50 | visibile |
 * | Crispy e2e | Panini | 8,00 | nascosto a mano |
 * | Coca e2e | Bevande | 2,50 | non disponibile a mano |
 *
 * Ingredienti: Pane (Big, Crispy) · Pollo (Crispy) · Ghiaccio (nessun prodotto del menù).
 */

export { TENANT_ID };

const uuid = (n: number) => `e2e5f000-0000-4000-a000-${String(n).padStart(12, "0")}`;

export const RULE_ID = uuid(1);
export const CATALOG_ID = uuid(2);
/** Le due regole di `{ rules: true }`: disponibilità programmata e prezzi. */
export const VIS_RULE_ID = uuid(4);
export const PRICE_RULE_ID = uuid(5);
export const PRODUCT = { big: uuid(101), crispy: uuid(102), coca: uuid(103) } as const;
export const INGREDIENT = { pane: uuid(201), pollo: uuid(202), ghiaccio: uuid(203) } as const;

const product = (id: string, name: string, price: number): Row => ({
    id,
    name,
    base_price: price,
    parent_product_id: null,
    product_type: "simple",
    option_groups: [],
    variants: []
});

/** L'albero di `loadCatalogForVisibilityDrawer` (catalogs → categorie → prodotti). */
export const CATALOG_TREE = {
    id: CATALOG_ID,
    name: "Menù e2e",
    categories: [
        {
            id: uuid(11),
            name: "Panini",
            level: 1,
            sort_order: 0,
            parent_category_id: null,
            products: [
                { id: uuid(21), sort_order: 0, product_id: PRODUCT.big, variant_product_id: null, product: product(PRODUCT.big, "Big e2e", 7.5) },
                { id: uuid(22), sort_order: 1, product_id: PRODUCT.crispy, variant_product_id: null, product: product(PRODUCT.crispy, "Crispy e2e", 8) }
            ]
        },
        {
            id: uuid(12),
            name: "Bevande",
            level: 1,
            sort_order: 1,
            parent_category_id: null,
            products: [
                { id: uuid(23), sort_order: 0, product_id: PRODUCT.coca, variant_product_id: null, product: product(PRODUCT.coca, "Coca e2e", 2.5) }
            ]
        }
    ]
};

export type DisponibilitaOptions = {
    /** Nessuna regola menù: la sede non mostra niente. */
    noRule?: boolean;
    /**
     * Due regole in più su tutte le sedi: «Sera e2e» (disponibilità: Big non
     * disponibile, Coca nascosta) e «Happy e2e» (prezzi: Big a 6,00 col
     * listino barrato). Coca resta nascosta: la modifica a mano «non
     * disponibile» non rimette un prodotto che la regola ha tolto.
     */
    rules?: boolean;
    /** Tutti e tre i prodotti nascosti a mano: il menù c'è, ma è vuoto. */
    allHidden?: boolean;
};

const timeRule = (id: string, name: string, ruleType: string, priority: number): Row => ({
    id,
    tenant_id: TENANT_ID,
    name,
    rule_type: ruleType,
    target_type: null,
    target_id: null,
    apply_to_all: true,
    priority,
    enabled: true,
    time_mode: "always",
    days_of_week: null,
    time_from: null,
    time_to: null,
    start_at: null,
    end_at: null,
    visibility_mode: "hide",
    created_at: "2026-03-01T10:00:00.000Z"
});

export function makeTables(activityId: string, options: DisponibilitaOptions): Tables {
    const hideAll = options.allHidden
        ? [PRODUCT.big, PRODUCT.crispy, PRODUCT.coca].map((productId, i) => ({
              id: uuid(310 + i),
              activity_id: activityId,
              product_id: productId,
              visible_override: false,
              price_override: null,
              mode: "hide"
          }))
        : null;
    return {
        schedules: [
            ...(options.noRule
            ? []
            : [
                  {
                      id: RULE_ID,
                      tenant_id: TENANT_ID,
                      name: "Pranzo e2e",
                      rule_type: "layout",
                      target_type: null,
                      target_id: null,
                      apply_to_all: true,
                      priority: 21,
                      enabled: true,
                      time_mode: "always",
                      days_of_week: null,
                      time_from: null,
                      time_to: null,
                      start_at: null,
                      end_at: null,
                      visibility_mode: "hide",
                      created_at: "2026-03-01T10:00:00.000Z"
                  }
              ]),
            ...(options.rules
                ? [timeRule(VIS_RULE_ID, "Sera e2e", "visibility", 21), timeRule(PRICE_RULE_ID, "Happy e2e", "price", 21)]
                : [])
        ],
        schedule_targets: [],
        schedule_visibility_overrides: options.rules
            ? [
                  { id: uuid(401), tenant_id: TENANT_ID, schedule_id: VIS_RULE_ID, product_id: PRODUCT.big, visible: false, mode: "disable" },
                  { id: uuid(402), tenant_id: TENANT_ID, schedule_id: VIS_RULE_ID, product_id: PRODUCT.coca, visible: false, mode: "hide" }
              ]
            : [],
        schedule_price_overrides: options.rules
            ? [
                  {
                      id: uuid(411),
                      tenant_id: TENANT_ID,
                      schedule_id: PRICE_RULE_ID,
                      product_id: PRODUCT.big,
                      option_value_id: null,
                      override_price: 6,
                      show_original_price: true
                  }
              ]
            : [],
        schedule_layout: options.noRule
            ? []
            : [{ id: uuid(3), tenant_id: TENANT_ID, schedule_id: RULE_ID, catalog_id: CATALOG_ID, style_id: null }],
        schedule_featured_contents: [],
        activity_group_members: [],
        activity_product_overrides: hideAll ?? [
            { id: uuid(301), activity_id: activityId, product_id: PRODUCT.crispy, visible_override: false, price_override: null, mode: "hide" },
            { id: uuid(302), activity_id: activityId, product_id: PRODUCT.coca, visible_override: false, price_override: null, mode: "disable" }
        ],
        ingredients: [
            { id: INGREDIENT.ghiaccio, tenant_id: TENANT_ID, name: "Ghiaccio e2e", created_at: "2026-03-01T10:00:00.000Z" },
            { id: INGREDIENT.pane, tenant_id: TENANT_ID, name: "Pane e2e", created_at: "2026-03-01T10:00:00.000Z" },
            { id: INGREDIENT.pollo, tenant_id: TENANT_ID, name: "Pollo e2e", created_at: "2026-03-01T10:00:00.000Z" }
        ],
        product_ingredients: [
            { tenant_id: TENANT_ID, product_id: PRODUCT.big, ingredient_id: INGREDIENT.pane, sort_order: 0 },
            { tenant_id: TENANT_ID, product_id: PRODUCT.crispy, ingredient_id: INGREDIENT.pane, sort_order: 0 },
            { tenant_id: TENANT_ID, product_id: PRODUCT.crispy, ingredient_id: INGREDIENT.pollo, sort_order: 1 }
        ]
    };
}

export type { WriteCall, WriteHandler } from "./restStub";
export type DisponibilitaStub = RestStub & { tables: Tables };

/**
 * Da chiamare DOPO aver aperto la sede (serve il suo id), PRIMA di andare su
 * `/disponibilita`: le rotte valgono per le richieste successive.
 */
export async function stubDisponibilita(
    page: Page,
    activityId: string,
    options: DisponibilitaOptions = {}
): Promise<DisponibilitaStub> {
    const tables = makeTables(activityId, options);
    const stub = await stubRest(page, {
        tables,
        enrich: (table, rows, params) => {
            const enriched = enrichAppearance(tables, table, rows, params);
            if (enriched) return enriched;
            if (table === "ingredients") return [...rows].sort((a, b) => String(a.name).localeCompare(String(b.name)));
            return rows;
        }
    });
    // L'albero del menù: solo la lettura con le categorie annidate.
    await page.route(/\/rest\/v1\/catalogs\?/, route => {
        const url = new URL(route.request().url());
        if (route.request().method() !== "GET" || !(url.searchParams.get("select") ?? "").includes("catalog_categories")) {
            return route.fallback();
        }
        const wantsObject = (route.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
        return route.fulfill({ json: wantsObject ? CATALOG_TREE : [CATALOG_TREE] });
    });
    // Le scritture tengono aggiornata la tabella finta: la pagina rilegge.
    const overrides = tables.activity_product_overrides;
    stub.onWrite("activity_product_overrides.POST", call => {
        const rows = (Array.isArray(call.body) ? call.body : [call.body]) as Row[];
        for (const row of rows) overrides.push({ price_override: null, ...row });
        return null;
    });
    stub.onWrite("activity_product_overrides.PATCH", call => {
        const id = call.params.get("id")?.replace(/^eq\./, "");
        const ids = call.params.get("product_id")?.replace(/^in\.\(|\)$/g, "").split(",") ?? [];
        for (const row of overrides) {
            if ((id && row.id === id) || ids.includes(String(row.product_id))) Object.assign(row, call.body as Row);
        }
        return null;
    });
    stub.onWrite("activity_product_overrides.DELETE", call => {
        const id = call.params.get("id")?.replace(/^eq\./, "");
        const ids = call.params.get("product_id")?.replace(/^in\.\(|\)$/g, "").split(",") ?? [];
        for (let i = overrides.length - 1; i >= 0; i--) {
            if ((id && overrides[i].id === id) || ids.includes(String(overrides[i].product_id))) overrides.splice(i, 1);
        }
        return null;
    });
    await freezeClock(page);
    return Object.assign(stub, { tables });
}

/** Un ruolo di sede, con i permessi che ha davvero (`docs/permissions-matrix.md`). */
export type SeatRole = "manager" | "staff" | "viewer";

/** Cosa toglie ogni ruolo ai permessi dell'utente e2e (owner) che servono qui. */
const MISSING: Record<SeatRole, string[]> = {
    manager: [],
    staff: ["scheduling.read", "scheduling.write", "activity_groups.read", "activity.manage"],
    viewer: ["scheduling.write", "activity_groups.read", "activity.manage"]
};

/**
 * L'utente e2e entra come `role` della sola sede `activityId`: riscrive la
 * risposta vera di `get_my_permissions`. Da chiamare prima di aprire la
 * pagina (i permessi si leggono al caricamento).
 */
export async function asSeatRole(page: Page, role: SeatRole, activityId: string): Promise<void> {
    await page.route(/\/rest\/v1\/rpc\/get_my_permissions/, async route => {
        try {
            const response = await route.fetch();
            const rows = (await response.json()) as Array<{ role: string; activity_ids: string[] | null; permissions: string[] | null }>;
            for (const row of rows) {
                row.role = role;
                row.activity_ids = [activityId];
                row.permissions = (row.permissions ?? []).filter(p => !MISSING[role].includes(p));
            }
            await route.fulfill({ response, json: rows });
        } catch {
            // Pagina chiusa a metà richiesta (fine del test): niente da riscrivere.
        }
    });
}
