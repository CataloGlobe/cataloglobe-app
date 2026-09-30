import type { Page } from "@playwright/test";
import { TENANT_ID } from "./reservationsStub";
import { stubRest, type RestStub, type Row, type Tables } from "./restStub";
import { freezeClock } from "./appearanceStub";

/**
 * Dati finti per l'e2e di Lingue (lotto `ds-5-coda`, P0).
 *
 * Lingue disponibili, lingue dell'azienda, copertura (la legge MainLayout e la
 * passa alla pagina) ed elementi da rivedere rispondono da qui. Permessi,
 * azienda e sidebar restano veri.
 *
 * | Lingua | Stato | Copertura |
 * |---|---|---|
 * | Italiano | base | 50 elementi |
 * | Inglese | attiva | 50/50, aggiornata |
 * | Francese | attiva | 48/50, 2 da rivedere |
 * | Spagnolo | attiva | 47/50, 3 falliti |
 * | Tedesco | spenta | — |
 */

export { TENANT_ID };

const uuid = (n: number) => `e2e5d000-0000-4000-a000-${String(n).padStart(12, "0")}`;
export const PRODUCT_ID = uuid(301);

const lang = (code: string, it: string, flag: string): Row => ({
    code,
    name_native: it,
    name_en: it,
    name_it: it,
    flag_emoji: flag,
    is_available: true
});

const tenantLang = (n: number, code: string, active: boolean): Row => ({
    id: uuid(n),
    tenant_id: TENANT_ID,
    language_code: code,
    is_active: active,
    created_at: "2026-09-01T10:00:00.000Z"
});

export function makeTables(): Tables {
    return {
        supported_languages: [
            lang("it", "Italiano", "🇮🇹"),
            lang("en", "Inglese", "🇬🇧"),
            lang("fr", "Francese", "🇫🇷"),
            lang("es", "Spagnolo", "🇪🇸"),
            lang("de", "Tedesco", "🇩🇪")
        ],
        tenant_languages: [
            tenantLang(1, "it", true),
            tenantLang(2, "en", true),
            tenantLang(3, "fr", true),
            tenantLang(4, "es", true),
            tenantLang(5, "de", false)
        ]
    };
}

const cov = (fresh: number, extra: Row = {}): Row => ({
    total: 50,
    fresh,
    stale: 0,
    pending: 0,
    failed: 0,
    missing: 0,
    last_updated: "2026-09-23T09:58:00.000Z",
    ...extra
});

export const COVERAGE = {
    en: cov(50),
    fr: cov(48, { stale: 2 }),
    es: cov(47, { failed: 3 })
};

export const STALE_FR = [
    {
        entity_type: "product",
        entity_id: PRODUCT_ID,
        field: "description",
        name: "Margherita e2e",
        source_text: "Pomodoro, mozzarella e basilico.",
        status: "manual",
        kind: "stale"
    },
    {
        entity_type: "ingredient",
        entity_id: uuid(401),
        field: "name",
        name: "Basilico e2e",
        source_text: "Basilico",
        status: null,
        kind: "missing"
    }
];

export type { WriteCall, WriteHandler } from "./restStub";
export type LingueStub = RestStub & { tables: Tables };

export async function stubLingue(page: Page): Promise<LingueStub> {
    const tables = makeTables();
    const stub = await stubRest(page, {
        tables,
        rpc: {
            get_translation_coverage: () => COVERAGE,
            get_stale_translations: (body) =>
                (body as { p_language_code?: string } | null)?.p_language_code === "fr" ? STALE_FR : []
        }
    });
    await freezeClock(page);
    return Object.assign(stub, { tables });
}
