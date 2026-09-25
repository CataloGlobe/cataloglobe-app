import type { Page } from "@playwright/test";
import { TENANT_ID } from "./reservationsStub";
import { stubRest, type RestStub, type Row, type Tables } from "./restStub";

/**
 * Dati finti per l'e2e di Stili (lotto `ds-5-stili-storie-evidenza`, P0).
 *
 * Stili, versioni e usi nelle regole rispondono da qui (`restStub.ts`:
 * scritture intercettate, 500 per quelle non registrate). Permessi, azienda e
 * sidebar restano veri. Le letture della competizione (regole, sedi, gruppi)
 * del dialogo d'eliminazione passano al server: il dialogo le tollera.
 */

export { TENANT_ID };

const uuid = (n: number) => `e2e5e000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const CREATED = "2026-03-17T10:00:00.000Z";

export const STYLE = {
    base: uuid(1),
    estate: uuid(2),
    sera: uuid(3),
    notte: uuid(4)
} as const;
export const MISSING_STYLE = uuid(999);
export const RULE = { pranzo: uuid(101) } as const;

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
            styleRow(STYLE.notte, 4, "Notte e2e", false, "2026-03-18T10:00:00.000Z")
        ],
        style_versions: [
            versionRow(STYLE.base, 1, 1, "#6366f1"),
            versionRow(STYLE.estate, 2, 3, "#f59e0b"),
            // Due versioni vecchie di Estate, per il menu Versioni.
            { ...versionRow(STYLE.estate, 21, 2, "#ef4444") },
            { ...versionRow(STYLE.estate, 22, 1, "#10b981") },
            versionRow(STYLE.sera, 3, 1, "#0ea5e9"),
            versionRow(STYLE.notte, 4, 1, "#111827")
        ],
        // «Estate e2e» veste una regola: in uso.
        schedule_layout: [
            { id: uuid(301), tenant_id: TENANT_ID, schedule_id: RULE.pranzo, style_id: STYLE.estate, catalog_id: null }
        ]
    };
}

const RULES: Record<string, Row> = {
    [RULE.pranzo]: {
        id: RULE.pranzo,
        tenant_id: TENANT_ID,
        name: "Pranzo e2e",
        enabled: true,
        start_at: null,
        end_at: null,
        time_mode: "always",
        days_of_week: null,
        time_from: null,
        time_to: null,
        apply_to_all: true
    }
};

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
            if (table === "schedule_layout" && select.includes("schedule:schedules")) {
                return rows.map(row => ({ ...row, schedule: RULES[row.schedule_id as string] ?? null }));
            }
            return rows;
        }
    });
    await page.route(/\/api\/public-catalog\/revalidate/, route => route.fulfill({ json: { ok: true } }));
    return Object.assign(stub, { tables });
}
