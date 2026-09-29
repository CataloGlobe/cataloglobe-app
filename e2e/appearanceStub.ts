import type { Page } from "@playwright/test";
import { TENANT_ID } from "./reservationsStub";
import type { Row, Tables } from "./restStub";

/**
 * Regole e sedi finte per le pagine che dicono dove e quando appare una cosa
 * (lotto `ds-5-regole-vive`, §50.13): Menù, Stili, Storie, In evidenza. Ogni
 * pagina ci mette le sue regole, sui suoi id; le sedi sono le stesse ovunque.
 *
 * L'orologio è fermo a **mercoledì 23/09/2026, 12:00 di Roma** (`NOW`), come
 * Programmazione: chi è «in onda adesso» non dipende dal giorno del test.
 *
 * | Sede | Stato | Gruppi |
 * |---|---|---|
 * | Centro e2e | pubblicata | — |
 * | Porto e2e | pubblicata | Costa e2e |
 * | Lago e2e | sospesa | — |
 */

/** Mercoledì 23/09/2026 alle 12:00 di Roma. */
export const NOW = new Date("2026-09-23T12:00:00+02:00");

export function sediOf(prefix: string) {
    const uuid = (n: number) => `${prefix}-0000-4000-a000-${String(n).padStart(12, "0")}`;
    return {
        SEDE: { centro: uuid(901), porto: uuid(902), lago: uuid(903) },
        GROUP: { costa: uuid(911) }
    } as const;
}

export const SEDE_NAME = { centro: "Centro e2e", porto: "Porto e2e", lago: "Lago e2e" } as const;

export type AppearanceRuleSpec = {
    id: string;
    name: string;
    rule_type: "layout" | "featured";
    enabled?: boolean;
    all?: boolean;
    activities?: string[];
    groups?: string[];
    time_mode?: "always" | "window";
    days_of_week?: number[] | null;
    time_from?: string | null;
    time_to?: string | null;
    start_at?: string | null;
    end_at?: string | null;
    created?: string;
    catalog_id?: string | null;
    style_id?: string | null;
    featured?: Array<{ id: string; slot: "before_catalog" | "after_catalog" }>;
};

/** Le tabelle che legge `listAppearanceSources` (più quelle che le altre letture delle pagine già usano). */
export function appearanceTables(prefix: string, rules: AppearanceRuleSpec[]): Tables {
    const { SEDE, GROUP } = sediOf(prefix);
    const activity = (id: string, name: string, status: "active" | "inactive"): Row => ({
        id,
        tenant_id: TENANT_ID,
        name,
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        status,
        inactive_reason: status === "inactive" ? "closed" : null,
        created_at: "2026-03-01T10:00:00.000Z"
    });
    return {
        schedules: rules.map(r => ({
            id: r.id,
            tenant_id: TENANT_ID,
            name: r.name,
            rule_type: r.rule_type,
            target_type: r.activities?.length ? "activity" : r.groups?.length ? "activity_group" : null,
            target_id: r.activities?.[0] ?? r.groups?.[0] ?? null,
            apply_to_all: Boolean(r.all),
            priority: 21,
            enabled: r.enabled ?? true,
            time_mode: r.time_mode ?? "always",
            days_of_week: r.days_of_week ?? null,
            time_from: r.time_from ?? null,
            time_to: r.time_to ?? null,
            start_at: r.start_at ?? null,
            end_at: r.end_at ?? null,
            created_at: r.created ?? "2026-03-01T10:00:00.000Z"
        })),
        schedule_targets: rules.flatMap(r => [
            ...(r.activities ?? []).map(id => ({ schedule_id: r.id, target_type: "activity", target_id: id })),
            ...(r.groups ?? []).map(id => ({ schedule_id: r.id, target_type: "activity_group", target_id: id }))
        ]),
        schedule_layout: rules
            .filter(r => r.rule_type === "layout")
            .map(r => ({
                id: `layout-${r.id}`,
                tenant_id: TENANT_ID,
                schedule_id: r.id,
                catalog_id: r.catalog_id ?? null,
                style_id: r.style_id ?? null
            })),
        schedule_featured_contents: rules.flatMap(r =>
            (r.featured ?? []).map((f, i) => ({
                id: `sfc-${r.id}-${i}`,
                tenant_id: TENANT_ID,
                schedule_id: r.id,
                featured_content_id: f.id,
                slot: f.slot,
                sort_order: i
            }))
        ),
        activities: [
            activity(SEDE.centro, SEDE_NAME.centro, "active"),
            activity(SEDE.lago, SEDE_NAME.lago, "inactive"),
            activity(SEDE.porto, SEDE_NAME.porto, "active")
        ],
        activity_group_members: [{ tenant_id: TENANT_ID, group_id: GROUP.costa, activity_id: SEDE.porto }]
    };
}

/**
 * Gli embedding su `schedules` e `schedule_layout` che `matches` non fa: quelli
 * di `listAppearanceSources` (layout, target, contenuti in evidenza) e quelli
 * delle letture che le pagine facevano prima (`schedule:schedules`,
 * `layout:schedule_layout`). Null se la lettura non ne chiede.
 */
export function enrichAppearance(tables: Tables, table: string, rows: Row[], params: URLSearchParams): Row[] | null {
    const select = params.get("select") ?? "";
    const layoutOf = (id: unknown) => tables.schedule_layout.find(l => l.schedule_id === id) ?? null;
    if (table === "schedules" && select.includes("targets:")) {
        return rows.map(row => ({
            ...row,
            layout: layoutOf(row.id),
            targets: tables.schedule_targets.filter(t => t.schedule_id === row.id),
            featured: tables.schedule_featured_contents.filter(f => f.schedule_id === row.id)
        }));
    }
    if (table === "schedules" && select.includes("layout:")) {
        return rows.map(row => ({ ...row, layout: layoutOf(row.id) }));
    }
    if ((table === "schedule_layout" || table === "schedule_featured_contents") && select.includes("schedule:")) {
        return rows.map(row => ({ ...row, schedule: tables.schedules.find(r => r.id === row.schedule_id) ?? null }));
    }
    return null;
}

/** L'orologio della pagina fermo su `NOW`. */
export async function freezeClock(page: Page): Promise<void> {
    await page.clock.setFixedTime(NOW);
}
