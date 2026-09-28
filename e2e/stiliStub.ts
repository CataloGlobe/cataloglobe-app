import type { Page } from "@playwright/test";
import { TENANT_ID } from "./reservationsStub";
import { stubRest, type RestStub, type Row, type Tables } from "./restStub";
import { appearanceTables, enrichAppearance, freezeClock, sediOf } from "./appearanceStub";

/**
 * Dati finti per l'e2e di Stili (lotto `ds-5-stili-storie-evidenza`, P0).
 *
 * Stili, versioni e usi nelle regole rispondono da qui (`restStub.ts`:
 * scritture intercettate, 500 per quelle non registrate). Permessi, azienda e
 * sidebar restano veri.
 *
 * Dove vestono (§50.13, `appearanceStub.ts`, orologio mercoledì 12:00):
 *
 * | Regola | Stile | Dove | Quando | Stato dello stile |
 * |---|---|---|---|---|
 * | Pranzo e2e | Estate | tutte | sempre | Attivo adesso (Centro, Porto) |
 * | Sera Porto e2e | Stile base | Porto | 18–21 | Programmato |
 * | Autunno spenta e2e | Autunno | tutte | spenta | Solo su regole ferme |
 *
 * Sera e Notte non vestono niente.
 */

export { TENANT_ID };

const uuid = (n: number) => `e2e5e000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const CREATED = "2026-03-17T10:00:00.000Z";

export const STYLE = {
    base: uuid(1),
    estate: uuid(2),
    sera: uuid(3),
    notte: uuid(4),
    autunno: uuid(5)
} as const;
export const MISSING_STYLE = uuid(999);
export const RULE = { pranzo: uuid(101), seraPorto: uuid(102), autunno: uuid(103) } as const;
const { SEDE } = sediOf("e2e5e000");

const version = (n: number): string => uuid(200 + n);

function styleRow(id: string, n: number, name: string, isSystem: boolean, updated: string): Row {
    return {
        id,
        tenant_id: TENANT_ID,
        name,
        is_system: isSystem,
        is_active: true,
        current_version_id: version(n),
        created_at: CREATED,
        updated_at: updated
    };
}

function versionRow(styleId: string, n: number, v: number, primary: string): Row {
    return {
        id: version(n),
        tenant_id: TENANT_ID,
        style_id: styleId,
        version: v,
        config: { colors: { primary, pageBackground: "#ffffff" } },
        created_at: CREATED
    };
}

function makeTables(): Tables {
    return {
        styles: [
            styleRow(STYLE.base, 1, "Stile base e2e", true, "2026-03-10T10:00:00.000Z"),
            styleRow(STYLE.estate, 2, "Estate e2e", false, "2026-03-20T10:00:00.000Z"),
            styleRow(STYLE.sera, 3, "Sera e2e", false, "2026-03-19T10:00:00.000Z"),
            styleRow(STYLE.notte, 4, "Notte e2e", false, "2026-03-18T10:00:00.000Z"),
            styleRow(STYLE.autunno, 5, "Autunno e2e", false, "2026-03-17T10:00:00.000Z")
        ],
        style_versions: [
            versionRow(STYLE.base, 1, 1, "#6366f1"),
            versionRow(STYLE.estate, 2, 3, "#f59e0b"),
            // Due versioni vecchie di Estate, per il menu Versioni.
            { ...versionRow(STYLE.estate, 21, 2, "#ef4444") },
            { ...versionRow(STYLE.estate, 22, 1, "#10b981") },
            versionRow(STYLE.sera, 3, 1, "#0ea5e9"),
            versionRow(STYLE.notte, 4, 1, "#111827"),
            versionRow(STYLE.autunno, 5, 1, "#b45309")
        ],
        // «Estate e2e» veste una regola: in uso.
        ...appearanceTables("e2e5e000", [
            { id: RULE.pranzo, name: "Pranzo e2e", rule_type: "layout", all: true, style_id: STYLE.estate, catalog_id: uuid(401) },
            { id: RULE.seraPorto, name: "Sera Porto e2e", rule_type: "layout", activities: [SEDE.porto], time_mode: "window", time_from: "18:00:00", time_to: "21:00:00", style_id: STYLE.base, catalog_id: uuid(401) },
            { id: RULE.autunno, name: "Autunno spenta e2e", rule_type: "layout", all: true, enabled: false, style_id: STYLE.autunno, catalog_id: uuid(401) }
        ])
    };
}

export type { WriteCall, WriteHandler } from "./restStub";
export type StiliStub = RestStub & { tables: Tables };

export async function stubStili(page: Page): Promise<StiliStub> {
    const tables = makeTables();
    const stub = await stubRest(page, {
        tables,
        enrich: (table, rows, params) => {
            const select = params.get("select") ?? "";
            if (table === "styles" && select.includes("current_version")) {
                return rows.map(row => ({
                    ...row,
                    current_version: tables.style_versions.find(v => v.id === row.current_version_id) ?? null
                }));
            }
            return enrichAppearance(tables, table, rows, params) ?? rows;
        }
    });
    await page.route(/\/api\/public-catalog\/revalidate/, route => route.fulfill({ json: { ok: true } }));
    await freezeClock(page);
    return Object.assign(stub, { tables });
}
