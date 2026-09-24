import type { Page } from "@playwright/test";
import { TENANT_ID } from "./reservationsStub";
import { stubRest, type RestStub, type Row, type Tables } from "./restStub";

/**
 * Dati finti per l'e2e di Programmazione (lotto `ds-5-programmazione`, P0).
 *
 * Le regole di staging dell'azienda di test sono dati che chiunque sposta a
 * mano; qui regole, sedi, gruppi, menù, stili, prodotti e contenuti in
 * evidenza rispondono da questi elenchi. Permessi, azienda e sidebar restano
 * veri. Le scritture non partono mai (`restStub.ts`).
 *
 * L'orologio è fermo a **mercoledì 23/09/2026, 12:00 di Roma** (`NOW`): le
 * dodici regole sono scelte perché ogni gruppo di stato abbia qualcosa a
 * quell'ora.
 *
 * | Regola | Tipo | Dove | Quando | Stato alle 12 |
 * |---|---|---|---|---|
 * | Carta tutto il giorno | menù | tutte | sempre | Adesso (esclusa a Centro) |
 * | Pranzo Centro | menù | Centro | Lun–Ven 11–15 | Adesso |
 * | Aperitivo Porto | menù | Porto | 18–21 | Programmata |
 * | Bozza senza menù | menù | tutte | sempre, spenta, niente menù | Bozza |
 * | Solo gruppo vuoto | menù | gruppo senza sedi | sempre | Bozza (nessuna sede raggiunta) |
 * | Menù spento | menù | tutte | sempre, spenta | Disabilitata |
 * | Sconto Spritz | prezzi | tutte | sempre | Adesso |
 * | Saldi d'estate | prezzi | tutte | 1/6–31/8/2026 | Scaduta |
 * | Stagionali Centro | disponibilità | Centro | sempre | Adesso |
 * | Promo Costa | in evidenza | gruppo Costa (= Porto) | sempre | Programmata (sovrascritta da Promo Porto) |
 * | Promo Porto | in evidenza | Porto | sempre | Adesso |
 * | Natale | in evidenza | tutte | dal 1/12/2026 | Programmata |
 */

export { TENANT_ID };

/** Mercoledì 23/09/2026 alle 12:00 di Roma. */
export const NOW = new Date("2026-09-23T12:00:00+02:00");

const uuid = (n: number) => `e2e0d000-0000-4000-a000-${String(n).padStart(12, "0")}`;

export const SEDE = { centro: uuid(1), porto: uuid(2), lago: uuid(3) } as const;
export const GROUP = { system: uuid(11), costa: uuid(12), vuoto: uuid(13) } as const;
export const MENU = { carta: uuid(21), pranzo: uuid(22) } as const;
export const STYLE = { base: uuid(31) } as const;
export const PRODUCT = { margherita: uuid(41), diavola: uuid(42), tiramisu: uuid(43), spritz: uuid(44), birra: uuid(45) } as const;
const SPRITZ_FORMAT = { group: uuid(51), piccolo: uuid(52), grande: uuid(53) } as const;
export const FEATURED = { autunno: uuid(61), jazz: uuid(62), natale: uuid(63) } as const;

export const RULE = {
    carta: uuid(101),
    pranzo: uuid(102),
    aperitivo: uuid(103),
    bozza: uuid(104),
    gruppoVuoto: uuid(105),
    spento: uuid(106),
    spritz: uuid(107),
    saldi: uuid(108),
    stagionali: uuid(109),
    promoCosta: uuid(110),
    promoPorto: uuid(111),
    natale: uuid(112)
} as const;
export const MISSING_RULE = uuid(199);

/** Nomi come li vede l'utente: i test li cercano per testo. */
export const RULE_NAME: Record<keyof typeof RULE, string> = {
    carta: "Carta tutto il giorno e2e",
    pranzo: "Pranzo Centro e2e",
    aperitivo: "Aperitivo Porto e2e",
    bozza: "Bozza senza menù e2e",
    gruppoVuoto: "Solo gruppo vuoto e2e",
    spento: "Menù spento e2e",
    spritz: "Sconto Spritz e2e",
    saldi: "Saldi d'estate e2e",
    stagionali: "Stagionali Centro e2e",
    promoCosta: "Promo Costa e2e",
    promoPorto: "Promo Porto e2e",
    natale: "Natale e2e"
};

const CREATED = "2026-03-17T10:00:00.000Z";

function activities(): Row[] {
    const a = (id: string, name: string, slug: string, status: "active" | "inactive", inactive_reason: string | null): Row => ({
        id,
        tenant_id: TENANT_ID,
        name,
        slug,
        status,
        inactive_reason,
        created_at: CREATED
    });
    return [
        a(SEDE.centro, "Centro e2e", "e2e-centro", "active", null),
        a(SEDE.lago, "Lago e2e", "e2e-lago", "inactive", "closed"),
        a(SEDE.porto, "Porto e2e", "e2e-porto", "active", null)
    ];
}

type Target = { type: "activity" | "activity_group"; id: string };

type StubRule = {
    key: keyof typeof RULE;
    rule_type: "layout" | "price" | "visibility" | "featured";
    enabled: boolean;
    all?: boolean;
    targets?: Target[];
    time_mode?: "always" | "window";
    days_of_week?: number[] | null;
    time_from?: string | null;
    time_to?: string | null;
    start_at?: string | null;
    end_at?: string | null;
    created: string;
};

function rules(): StubRule[] {
    const all = true;
    return [
        { key: "carta", rule_type: "layout", enabled: true, all, created: "2026-03-01T10:00:00Z" },
        { key: "pranzo", rule_type: "layout", enabled: true, targets: [{ type: "activity", id: SEDE.centro }], time_mode: "window", days_of_week: [1, 2, 3, 4, 5], time_from: "11:00:00", time_to: "15:00:00", created: "2026-03-02T10:00:00Z" },
        { key: "aperitivo", rule_type: "layout", enabled: true, targets: [{ type: "activity", id: SEDE.porto }], time_mode: "window", time_from: "18:00:00", time_to: "21:00:00", created: "2026-03-03T10:00:00Z" },
        { key: "bozza", rule_type: "layout", enabled: false, all, created: "2026-09-20T10:00:00Z" },
        { key: "gruppoVuoto", rule_type: "layout", enabled: true, targets: [{ type: "activity_group", id: GROUP.vuoto }], created: "2026-03-05T10:00:00Z" },
        { key: "spento", rule_type: "layout", enabled: false, all, created: "2026-03-06T10:00:00Z" },
        { key: "spritz", rule_type: "price", enabled: true, all, created: "2026-03-07T10:00:00Z" },
        { key: "saldi", rule_type: "price", enabled: true, all, time_mode: "window", start_at: "2026-05-31T22:00:00Z", end_at: "2026-08-31T21:59:59Z", created: "2026-03-08T10:00:00Z" },
        { key: "stagionali", rule_type: "visibility", enabled: true, targets: [{ type: "activity", id: SEDE.centro }], created: "2026-03-09T10:00:00Z" },
        { key: "promoCosta", rule_type: "featured", enabled: true, targets: [{ type: "activity_group", id: GROUP.costa }], created: "2026-03-10T10:00:00Z" },
        { key: "promoPorto", rule_type: "featured", enabled: true, targets: [{ type: "activity", id: SEDE.porto }], created: "2026-03-11T10:00:00Z" },
        { key: "natale", rule_type: "featured", enabled: true, all, time_mode: "window", start_at: "2026-11-30T23:00:00Z", end_at: "2026-12-31T22:59:59Z", created: "2026-03-12T10:00:00Z" }
    ];
}

function scheduleRow(r: StubRule): Row {
    const first = r.targets?.[0] ?? null;
    return {
        id: RULE[r.key],
        tenant_id: TENANT_ID,
        name: RULE_NAME[r.key],
        rule_type: r.rule_type,
        target_type: first?.type ?? null,
        target_id: first?.id ?? null,
        apply_to_all: Boolean(r.all),
        visibility_mode: "hide",
        priority: 21,
        priority_level: "medium",
        display_order: 0,
        enabled: r.enabled,
        time_mode: r.time_mode ?? "always",
        days_of_week: r.days_of_week ?? null,
        time_from: r.time_from ?? null,
        time_to: r.time_to ?? null,
        start_at: r.start_at ?? null,
        end_at: r.end_at ?? null,
        created_at: r.created
    };
}

function makeTables(): Tables {
    const rs = rules();
    const style = { id: STYLE.base, name: "Stile base e2e", current_version: { config: {} } };
    const layout = (key: keyof typeof RULE, catalog: string | null): Row => ({
        schedule_id: RULE[key],
        tenant_id: TENANT_ID,
        catalog_id: catalog,
        style_id: STYLE.base
    });
    const products = [
        { id: PRODUCT.birra, name: "Birra e2e" },
        { id: PRODUCT.diavola, name: "Diavola e2e" },
        { id: PRODUCT.margherita, name: "Margherita e2e" },
        { id: PRODUCT.spritz, name: "Spritz e2e" },
        { id: PRODUCT.tiramisu, name: "Tiramisù e2e" }
    ];
    const productName = (id: string) => ({ name: products.find(p => p.id === id)?.name ?? null });
    const featuredTitle = (id: string) =>
        ({ [FEATURED.autunno]: "Promo autunno e2e", [FEATURED.jazz]: "Serata jazz e2e", [FEATURED.natale]: "Luci di Natale e2e" })[id];
    const sfc = (key: keyof typeof RULE, featured_content_id: string, slot: "before_catalog" | "after_catalog", sort_order: number): Row => ({
        schedule_id: RULE[key],
        tenant_id: TENANT_ID,
        featured_content_id,
        slot,
        sort_order,
        featured_content: { title: featuredTitle(featured_content_id) }
    });

    return {
        schedules: rs.map(scheduleRow),
        schedule_targets: rs.flatMap(r =>
            (r.targets ?? []).map(t => ({ schedule_id: RULE[r.key], target_type: t.type, target_id: t.id }))
        ),
        schedule_layout: [
            layout("carta", MENU.carta),
            layout("pranzo", MENU.pranzo),
            layout("aperitivo", MENU.carta),
            // «Bozza senza menù»: la riga c'è, il menù no.
            layout("bozza", null),
            layout("gruppoVuoto", MENU.carta),
            layout("spento", MENU.pranzo)
        ].map(row => ({ ...row, style })),
        schedule_price_overrides: [
            { schedule_id: RULE.spritz, product_id: PRODUCT.spritz, option_value_id: SPRITZ_FORMAT.piccolo, override_price: 4, show_original_price: true, product: productName(PRODUCT.spritz) },
            { schedule_id: RULE.spritz, product_id: PRODUCT.spritz, option_value_id: SPRITZ_FORMAT.grande, override_price: 6, show_original_price: true, product: productName(PRODUCT.spritz) },
            { schedule_id: RULE.spritz, product_id: PRODUCT.margherita, option_value_id: null, override_price: 6.5, show_original_price: false, product: productName(PRODUCT.margherita) },
            { schedule_id: RULE.saldi, product_id: PRODUCT.diavola, option_value_id: null, override_price: 7, show_original_price: true, product: productName(PRODUCT.diavola) }
        ],
        schedule_visibility_overrides: [
            { schedule_id: RULE.stagionali, product_id: PRODUCT.tiramisu, visible: false, mode: "hide", product: productName(PRODUCT.tiramisu) },
            { schedule_id: RULE.stagionali, product_id: PRODUCT.birra, visible: false, mode: "disable", product: productName(PRODUCT.birra) }
        ],
        schedule_featured_contents: [
            sfc("promoCosta", FEATURED.autunno, "before_catalog", 0),
            sfc("promoPorto", FEATURED.autunno, "before_catalog", 0),
            sfc("promoPorto", FEATURED.jazz, "after_catalog", 0),
            sfc("natale", FEATURED.natale, "before_catalog", 0)
        ],
        activities: activities(),
        activity_groups: [
            { id: GROUP.system, tenant_id: TENANT_ID, name: "Tutte le sedi", is_system: true },
            { id: GROUP.costa, tenant_id: TENANT_ID, name: "Costa e2e", is_system: false },
            { id: GROUP.vuoto, tenant_id: TENANT_ID, name: "Gruppo vuoto e2e", is_system: false }
        ],
        activity_group_members: [
            { group_id: GROUP.system, activity_id: SEDE.centro },
            { group_id: GROUP.system, activity_id: SEDE.porto },
            { group_id: GROUP.system, activity_id: SEDE.lago },
            { group_id: GROUP.costa, activity_id: SEDE.porto }
        ],
        catalogs: [
            { id: MENU.carta, tenant_id: TENANT_ID, name: "Carta e2e" },
            { id: MENU.pranzo, tenant_id: TENANT_ID, name: "Pranzo e2e" }
        ],
        styles: [{ id: STYLE.base, tenant_id: TENANT_ID, name: "Stile base e2e", is_system: true, is_active: true, current_version: { version: 1 } }],
        products: products.map(p => ({
            ...p,
            tenant_id: TENANT_ID,
            parent_product_id: null,
            option_groups:
                p.id === PRODUCT.spritz
                    ? [{ group_kind: "PRIMARY_PRICE", values: [{ id: SPRITZ_FORMAT.piccolo, name: "Piccolo" }, { id: SPRITZ_FORMAT.grande, name: "Grande" }] }]
                    : []
        })),
        product_groups: [{ id: uuid(71), tenant_id: TENANT_ID, name: "Dolci e2e" }],
        product_group_items: [{ product_id: PRODUCT.tiramisu, group_id: uuid(71), tenant_id: TENANT_ID }],
        featured_contents: [
            { id: FEATURED.natale, tenant_id: TENANT_ID, title: "Luci di Natale e2e", status: "published" },
            { id: FEATURED.autunno, tenant_id: TENANT_ID, title: "Promo autunno e2e", status: "published" },
            { id: FEATURED.jazz, tenant_id: TENANT_ID, title: "Serata jazz e2e", status: "published" }
        ]
    };
}

export type { WriteCall } from "./restStub";
export type ProgrammazioneStub = RestStub;

export async function stubProgrammazione(page: Page): Promise<ProgrammazioneStub> {
    const tables = makeTables();
    const stub = await stubRest(page, {
        tables,
        // Il resolver del simulatore legge il menù come embedding di `schedules`.
        enrich: (table, rows, params) => {
            if (table !== "schedules" || !(params.get("select") ?? "").includes("layout:")) return rows;
            return rows.map(row => ({
                ...row,
                layout: tables.schedule_layout.find(l => l.schedule_id === row.id) ?? null
            }));
        },
        rpc: {
            // Legge: senza stub passerebbe al server vero (`get_` → fallback).
            get_schedule_featured_contents: body => {
                const scheduleId = (body as { p_schedule_id?: string } | null)?.p_schedule_id;
                return tables.schedule_featured_contents.filter(r => r.schedule_id === scheduleId);
            }
        }
    });
    await page.route(/\/api\/public-catalog\/revalidate/, route => route.fulfill({ json: { ok: true } }));
    await page.clock.setFixedTime(NOW);
    return stub;
}
