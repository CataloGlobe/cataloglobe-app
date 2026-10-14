import { describe, expect, it } from "vitest";
import { resolveRulesForActivity as resolveWebRules } from "@/services/supabase/scheduleResolver";
import { resolveRulesForActivity as resolveEdgeRules } from "@shared/scheduleResolver";
import { resolveCompetition, type CompetitionRule } from "@shared/scheduleCompetition";
import { toRomeDateTime, type RomeDateTime } from "@/services/supabase/schedulingNow";
import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import { buildScheduleMatrix } from "@/utils/scheduleMatrix";

type TableRows = Record<string, Array<Record<string, unknown>>>;
type UiRuleType = "layout" | "price" | "visibility" | "featured";

const TEST_TENANT_ID = "00000000-0000-0000-0000-000000000001";

class FakeQueryBuilder implements PromiseLike<{ data: unknown[] | null; error: unknown | null }> {
    private readonly filters: Array<(row: Record<string, unknown>) => boolean> = [];
    private selectClause = "";

    constructor(
        private readonly table: string,
        private readonly tables: TableRows
    ) {}

    select(columns: string) {
        this.selectClause = columns;
        return this;
    }

    eq(column: string, value: unknown) {
        this.filters.push(row => row[column] === value);
        return this;
    }

    in(column: string, values: unknown[]) {
        const set = new Set(values);
        this.filters.push(row => set.has(row[column]));
        return this;
    }

    maybeSingle() {
        const result = this.execute();
        if (result.error) return Promise.resolve({ data: null, error: result.error });
        const rows = (result.data ?? []) as Record<string, unknown>[];
        return Promise.resolve({ data: rows[0] ?? null, error: null });
    }

    then<TResult1 = { data: unknown[] | null; error: unknown | null }, TResult2 = never>(
        onfulfilled?:
            | ((value: { data: unknown[] | null; error: unknown | null }) => TResult1 | PromiseLike<TResult1>)
            | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
        return Promise.resolve(this.execute()).then(onfulfilled ?? undefined, onrejected ?? undefined);
    }

    private execute(): { data: unknown[] | null; error: unknown | null } {
        try {
            const source = this.tables[this.table] ?? [];
            let rows = source.filter(row => this.filters.every(filter => filter(row)));

            if (this.table === "schedules" && this.selectClause.includes("layout:schedule_layout")) {
                rows = rows.map(row => this.withLayoutProjection(row));
            } else {
                rows = rows.map(row => ({ ...row }));
            }

            return { data: rows, error: null };
        } catch (error) {
            return { data: null, error };
        }
    }

    private withLayoutProjection(row: Record<string, unknown>) {
        const layoutRows = this.tables.schedule_layout ?? [];
        const scheduleLayout = layoutRows.find(layout => layout.schedule_id === row.id) ?? null;

        if (!scheduleLayout) {
            return { ...row, layout: null };
        }

        return {
            ...row,
            layout: {
                catalog_id: scheduleLayout.catalog_id ?? null,
                style: scheduleLayout.style ?? []
            }
        };
    }
}

function createFakeSupabase(tables: TableRows) {
    return {
        from(table: string) {
            return new FakeQueryBuilder(table, tables);
        }
    };
}

function buildSchedule(
    input: Partial<Record<string, unknown>> & {
        id: string;
        rule_type: UiRuleType;
        target_type?: "activity" | "activity_group" | "catalog";
        target_id?: string;
    }
) {
    return {
        id: input.id,
        tenant_id: input.tenant_id ?? TEST_TENANT_ID,
        rule_type: input.rule_type,
        enabled: input.enabled ?? true,
        priority: input.priority ?? 10,
        created_at: input.created_at ?? "2026-01-01T00:00:00.000Z",
        time_mode: input.time_mode ?? "always",
        days_of_week: input.days_of_week ?? null,
        time_from: input.time_from ?? null,
        time_to: input.time_to ?? null,
        start_at: input.start_at ?? null,
        end_at: input.end_at ?? null,
        target_type: input.target_type ?? "activity",
        target_id: input.target_id ?? "activity-1",
        apply_to_all: input.apply_to_all ?? false,
        visibility_mode: input.visibility_mode ?? "hide"
    };
}

/**
 * Le fasce come le scrive il ponte (mig 20261014090000) dalle colonne di
 * oggi, per le tabelle che non le danno già: il resolver legge solo le fasce.
 */
function withBridgeSlots(tables: TableRows): TableRows {
    if (tables.schedule_slots) return tables;
    const toMinutes = (value: unknown) =>
        typeof value === "string" ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)) : null;
    const slots: Array<Record<string, unknown>> = [];
    for (const row of tables.schedules ?? []) {
        if (row.time_mode !== "window") continue;
        const days = (row.days_of_week as number[] | null) ?? null;
        const from = toMinutes(row.time_from);
        const rawTo = toMinutes(row.time_to);
        const slot = (daysOfWeek: number[] | null, start: number, end: number) =>
            slots.push({
                id: `slot-${String(row.id)}`,
                schedule_id: row.id,
                days_of_week: daysOfWeek,
                start_minute: start,
                end_minute: end,
                sort_order: 0
            });
        if (from === null || rawTo === null) {
            if (days !== null) slot(days, 0, 1440);
            continue;
        }
        const to = rawTo === 1439 && from < 1439 ? 1440 : rawTo;
        if (to <= from) slot([], 0, 1440);
        else slot(days, from, to);
    }
    return { ...tables, schedule_slots: slots };
}

async function resolveIds(params: {
    tables: TableRows;
    activityId: string;
    now: RomeDateTime;
}) {
    const fakeSupabase = createFakeSupabase(withBridgeSlots(params.tables));
    const web = await resolveWebRules({
        supabase: fakeSupabase,
        activityId: params.activityId,
        tenantId: TEST_TENANT_ID,
        now: params.now,
        includeLayoutStyle: false,
        includeLaterMenus: true
    });
    const edge = await resolveEdgeRules({
        supabase: fakeSupabase,
        activityId: params.activityId,
        tenantId: TEST_TENANT_ID,
        now: params.now,
        includeLayoutStyle: false,
        includeLaterMenus: true
    });
    return { web, edge };
}

describe("Scheduling consistency contract", () => {
    it("web resolver and edge resolver return identical output", async () => {
        const tables: TableRows = {
            activity_group_members: [{ group_id: "group-1", activity_id: "activity-1" }],
            schedule_targets: [
                { schedule_id: "layout-1", target_type: "activity", target_id: "activity-1" },
                { schedule_id: "price-1", target_type: "activity_group", target_id: "group-1" }
            ],
            schedule_layout: [{ schedule_id: "layout-1", catalog_id: "catalog-1" }],
            schedules: [
                buildSchedule({
                    id: "layout-1",
                    rule_type: "layout",
                    target_type: "activity",
                    target_id: "activity-1",
                    priority: 2
                }),
                buildSchedule({
                    id: "price-1",
                    rule_type: "price",
                    target_type: "activity_group",
                    target_id: "group-1",
                    priority: 5
                }),
                buildSchedule({
                    id: "vis-1",
                    rule_type: "visibility",
                    apply_to_all: true,
                    target_type: "catalog",
                    target_id: "catalog-any",
                    priority: 8,
                    visibility_mode: "disable"
                })
            ]
        };

        const now = toRomeDateTime(new Date("2026-03-26T12:00:00.000Z"));
        const { web, edge } = await resolveIds({ tables, activityId: "activity-1", now });

        expect(web).toEqual(edge);
        expect(web.layout.catalogId).toBe("catalog-1");
        expect(web.priceRuleId).toBe("price-1");
        expect(web.visibilityRule?.scheduleId).toBe("vis-1");
    });

    it("specificity-first is the only precedence: activity wins over global even with worse priority", async () => {
        const tables: TableRows = {
            activity_group_members: [],
            schedule_targets: [
                { schedule_id: "activity-layout", target_type: "activity", target_id: "activity-1" }
            ],
            schedule_layout: [
                { schedule_id: "global-layout", catalog_id: "catalog-global" },
                { schedule_id: "activity-layout", catalog_id: "catalog-activity" }
            ],
            schedules: [
                buildSchedule({
                    id: "global-layout",
                    rule_type: "layout",
                    apply_to_all: true,
                    target_type: "catalog",
                    target_id: "catalog-any",
                    priority: 1,
                    created_at: "2026-01-01T00:00:00.000Z"
                }),
                buildSchedule({
                    id: "activity-layout",
                    rule_type: "layout",
                    target_type: "activity",
                    target_id: "activity-1",
                    priority: 9,
                    created_at: "2026-01-02T00:00:00.000Z"
                })
            ]
        };

        const now = toRomeDateTime(new Date("2026-03-26T12:00:00.000Z"));
        const { web, edge } = await resolveIds({ tables, activityId: "activity-1", now });

        expect(web.layout.scheduleId).toBe("activity-layout");
        expect(edge.layout.scheduleId).toBe("activity-layout");
    });

    it("tie-break inside same specificity stays priority ASC -> created_at ASC -> id ASC", async () => {
        const tables: TableRows = {
            activity_group_members: [],
            schedule_targets: [
                { schedule_id: "layout-new", target_type: "activity", target_id: "activity-1" },
                { schedule_id: "layout-old", target_type: "activity", target_id: "activity-1" }
            ],
            schedule_layout: [
                { schedule_id: "layout-old", catalog_id: "catalog-old" },
                { schedule_id: "layout-new", catalog_id: "catalog-new" }
            ],
            schedules: [
                buildSchedule({
                    id: "layout-new",
                    rule_type: "layout",
                    target_type: "activity",
                    target_id: "activity-1",
                    priority: 3,
                    created_at: "2026-02-10T10:00:00.000Z"
                }),
                buildSchedule({
                    id: "layout-old",
                    rule_type: "layout",
                    target_type: "activity",
                    target_id: "activity-1",
                    priority: 3,
                    created_at: "2026-02-01T10:00:00.000Z"
                })
            ]
        };

        const now = toRomeDateTime(new Date("2026-03-26T12:00:00.000Z"));
        const { web } = await resolveIds({ tables, activityId: "activity-1", now });

        expect(web.layout.scheduleId).toBe("layout-old");
        expect(web.layout.catalogId).toBe("catalog-old");
    });

    it("a multi-target rule (schedule_targets, passo 3) resolves on BOTH assigned sedi", async () => {
        const tables: TableRows = {
            activity_group_members: [],
            schedule_targets: [
                { schedule_id: "multi-layout", target_type: "activity", target_id: "activity-1" },
                { schedule_id: "multi-layout", target_type: "activity", target_id: "activity-2" }
            ],
            schedule_layout: [{ schedule_id: "multi-layout", catalog_id: "catalog-multi" }],
            schedules: [
                buildSchedule({
                    id: "multi-layout",
                    rule_type: "layout",
                    target_type: "activity",
                    target_id: "activity-1",
                    priority: 5
                })
            ]
        };

        const now = toRomeDateTime(new Date("2026-03-26T12:00:00.000Z"));
        const first = await resolveIds({ tables, activityId: "activity-1", now });
        const second = await resolveIds({ tables, activityId: "activity-2", now });

        expect(first.web.layout.scheduleId).toBe("multi-layout");
        expect(first.edge.layout.scheduleId).toBe("multi-layout");
        expect(second.web.layout.scheduleId).toBe("multi-layout");
        expect(second.edge.layout.scheduleId).toBe("multi-layout");
    });

    it("apply_to_all wins over a stray schedule_targets row on the SAME schedule (defensive hardening)", async () => {
        // Data anomaly: a schedule is apply_to_all=true but still has a
        // leftover schedule_targets row (e.g. from before reconcile). The
        // resolver must still treat it as global, not as activity-specific —
        // this is the exact case supabase/migrations/20260917195100_schedule_targets_reconcile.sql
        // cleans up going forward; the resolver must be defensive regardless.
        const tables: TableRows = {
            activity_group_members: [],
            schedule_targets: [
                { schedule_id: "stray-target-layout", target_type: "activity", target_id: "activity-1" }
            ],
            schedule_layout: [{ schedule_id: "stray-target-layout", catalog_id: "catalog-stray" }],
            schedules: [
                buildSchedule({
                    id: "stray-target-layout",
                    rule_type: "layout",
                    apply_to_all: true,
                    target_type: "activity",
                    target_id: "activity-1",
                    priority: 5
                })
            ]
        };

        const now = toRomeDateTime(new Date("2026-03-26T12:00:00.000Z"));
        const { web, edge } = await resolveIds({ tables, activityId: "activity-1", now });

        expect(web.layout.scheduleId).toBe("stray-target-layout");
        expect(edge.layout.scheduleId).toBe("stray-target-layout");
        // Also resolves for an UNRELATED activity — proof it's genuinely
        // global (specificity 0), not accidentally elevated by the stray row.
        const other = await resolveIds({ tables, activityId: "activity-99", now });
        expect(other.web.layout.scheduleId).toBe("stray-target-layout");
    });

    it("1. same sede: the more specific time window wins over «always», even with worse priority", async () => {
        const tables = TEMPORAL_FIXTURE;
        const now = toRomeDateTime(new Date("2026-03-26T12:00:00.000Z")); // 13:00 Roma
        const { web, edge } = await resolveIds({ tables, activityId: "activity-1", now });

        expect(web.layout.scheduleId).toBe("lunch-layout");
        expect(edge).toEqual(web);

        const evening = toRomeDateTime(new Date("2026-03-26T19:00:00.000Z")); // 20:00 Roma
        const later = await resolveIds({ tables, activityId: "activity-1", now: evening });
        expect(later.web.layout.scheduleId).toBe("always-layout");
    });

    it("4. a layout rule without a catalog is skipped but still counted as configured", async () => {
        const tables = NO_CATALOG_FIXTURE;
        const now = toRomeDateTime(new Date("2026-03-26T12:00:00.000Z"));
        const { web, edge } = await resolveIds({ tables, activityId: "activity-1", now });

        expect(web.layout.scheduleId).toBe("global-layout");
        expect(web.layoutCandidateCount).toBe(2);
        expect(edge).toEqual(web);
    });

    it("5. featured competes like the other layers: one winner per sede", async () => {
        const tables = FEATURED_FIXTURE;
        const now = toRomeDateTime(new Date("2026-03-26T12:00:00.000Z"));
        const { web, edge } = await resolveIds({ tables, activityId: "activity-1", now });

        expect(web.featuredRule?.scheduleId).toBe("featured-activity");
        expect(edge).toEqual(web);
        const other = await resolveIds({ tables, activityId: "activity-2", now });
        expect(other.web.featuredRule?.scheduleId).toBe("featured-global");
    });

    it("7. days_of_week = [] never matches (staging aaa845cf), null matches every day", async () => {
        const tables = EMPTY_DAYS_FIXTURE;
        const now = toRomeDateTime(new Date("2026-03-26T12:00:00.000Z"));
        const { web, edge } = await resolveIds({ tables, activityId: "activity-1", now });

        expect(web.featuredRule?.scheduleId).toBe("featured-null-days");
        expect(edge).toEqual(web);
    });

    it("12. bridge: the resolver picks exactly what resolveCompetition picks, for every fixture", async () => {
        const instants = [
            "2026-03-26T12:00:00.000Z",
            "2026-03-26T19:00:00.000Z",
            "2026-03-29T01:30:00.000Z",
            "2026-10-25T00:30:00.000Z"
        ].map(iso => toRomeDateTime(new Date(iso)));

        for (const [name, tables] of Object.entries(BRIDGE_FIXTURES)) {
            for (const activityId of ["activity-1", "activity-2", "activity-99"]) {
                for (const now of instants) {
                    const { web, edge } = await resolveIds({ tables, activityId, now });
                    const seat = {
                        activityId,
                        groupIds: (tables.activity_group_members ?? [])
                            .filter(row => row.activity_id === activityId)
                            .map(row => String(row.group_id))
                    };
                    const expected = resolveCompetition(competitionRulesFromTables(tables), seat, now);
                    const label = `${name} · ${activityId} · ${now.day}/${now.month + 1} ${now.hour}:${now.minute}`;

                    expect(edge, label).toEqual(web);
                    expect(web.layout.scheduleId, label).toBe(expected.layout.winner?.rule.id ?? null);
                    expect(web.layoutCandidateCount, label).toBe(expected.layout.candidates.length);
                    expect(web.priceRuleId, label).toBe(expected.price.winner?.rule.id ?? null);
                    expect(web.visibilityRule?.scheduleId ?? null, label).toBe(
                        expected.visibility.winner?.rule.id ?? null
                    );
                    expect(web.featuredRule?.scheduleId ?? null, label).toBe(
                        expected.featured.winner?.rule.id ?? null
                    );
                }
            }
        }
    });

    it("13. matrix: the Programmazione matrix and simulator pick what the resolver picks, for every fixture", async () => {
        const instants = [
            "2026-03-26T12:00:00.000Z",
            "2026-03-26T19:00:00.000Z",
            "2026-03-29T01:30:00.000Z",
            "2026-10-25T00:30:00.000Z"
        ].map(iso => toRomeDateTime(new Date(iso)));
        const activityIds = ["activity-1", "activity-2", "activity-99"];

        for (const [name, tables] of Object.entries(BRIDGE_FIXTURES)) {
            const activityIdsByGroupId: Record<string, string[]> = {};
            for (const row of tables.activity_group_members ?? []) {
                const groupId = String(row.group_id);
                activityIdsByGroupId[groupId] = [...(activityIdsByGroupId[groupId] ?? []), String(row.activity_id)];
            }
            for (const now of instants) {
                const matrix = buildScheduleMatrix({
                    rules: layoutRulesFromTables(tables),
                    activities: activityIds.map(id => ({ id, name: id, status: "active" as const })),
                    activityIdsByGroupId,
                    manualCounts: null,
                    filterActivityId: null,
                    instant: now,
                    subscriptionInactive: false
                });
                for (const activityId of activityIds) {
                    const { web } = await resolveIds({ tables, activityId, now });
                    const row = matrix.rows.find(r => r.activityId === activityId)!;
                    const winnerId = (type: UiRuleType) => {
                        const cell = row.cells[type];
                        return cell.kind === "winner" ? cell.rule.id : null;
                    };
                    const label = `${name} · ${activityId} · ${now.day}/${now.month + 1} ${now.hour}:${now.minute}`;

                    expect(winnerId("layout"), label).toBe(web.layout.scheduleId);
                    expect(winnerId("price"), label).toBe(web.priceRuleId);
                    expect(winnerId("visibility"), label).toBe(web.visibilityRule?.scheduleId ?? null);
                    expect(winnerId("featured"), label).toBe(web.featuredRule?.scheduleId ?? null);
                }
            }
        }
    });

    it("14. giudice nuovo: fasce vere oltre la mezzanotte, con le sedi della fascia", async () => {
        const tables: TableRows = {
            activity_group_members: [],
            schedule_targets: [
                { id: "t-1", schedule_id: "night", target_type: "activity", target_id: "activity-1" },
                { id: "t-2", schedule_id: "night", target_type: "activity", target_id: "activity-2" }
            ],
            schedule_layout: [
                { schedule_id: "base", catalog_id: "catalog-base" },
                { schedule_id: "night", catalog_id: "catalog-night" }
            ],
            schedules: [
                buildSchedule({ id: "base", rule_type: "layout", apply_to_all: true }),
                buildSchedule({ id: "night", rule_type: "layout", time_mode: "window" })
            ],
            // Sabato 19:00-02:00, solo nella sede 1.
            schedule_slots: [
                { id: "s-1", schedule_id: "night", days_of_week: [6], start_minute: 1140, end_minute: 1560, sort_order: 0 }
            ],
            schedule_slot_targets: [{ slot_id: "s-1", schedule_target_id: "t-1" }]
        };
        // Domenica 29/03/2026 01:30 a Roma.
        const sundayNight = toRomeDateTime(new Date("2026-03-29T00:30:00.000Z"));
        const one = await resolveIds({ tables, activityId: "activity-1", now: sundayNight });
        expect(one.edge).toEqual(one.web);
        expect(one.web.layout.catalogId).toBe("catalog-night");
        const two = await resolveIds({ tables, activityId: "activity-2", now: sundayNight });
        expect(two.web.layout.catalogId).toBe("catalog-base");
    });

    it("15. giudice nuovo: due menù «insieme» in onda, il primo per sort_order; «al posto» li copre", async () => {
        const tables: TableRows = {
            activity_group_members: [],
            schedule_targets: [],
            schedule_layout: [],
            schedule_menu: [
                { schedule_id: "lunch", catalog_id: "catalog-lunch" },
                { schedule_id: "wine", catalog_id: "catalog-wine" },
                { schedule_id: "xmas", catalog_id: "catalog-xmas" }
            ],
            catalogs: [
                { id: "catalog-lunch", tenant_id: TEST_TENANT_ID, sort_order: 2 },
                { id: "catalog-wine", tenant_id: TEST_TENANT_ID, sort_order: 1 },
                { id: "catalog-xmas", tenant_id: TEST_TENANT_ID, sort_order: 3 }
            ],
            schedules: [
                { ...buildSchedule({ id: "lunch", rule_type: "layout", apply_to_all: true }), rule_type: "menu", overlap_mode: "together" },
                { ...buildSchedule({ id: "wine", rule_type: "layout", apply_to_all: true }), rule_type: "menu", overlap_mode: "together" },
                {
                    ...buildSchedule({ id: "xmas", rule_type: "layout", apply_to_all: true, time_mode: "window" }),
                    rule_type: "menu",
                    overlap_mode: "replace"
                }
            ],
            // «Al posto» solo la sera: alle 13 si vedono gli «insieme», «xmas» è più tardi.
            schedule_slots: [
                { id: "s-x", schedule_id: "xmas", days_of_week: null, start_minute: 1140, end_minute: 1380, sort_order: 0 }
            ]
        };
        const noon = toRomeDateTime(new Date("2026-03-26T12:00:00.000Z"));
        const { web, edge } = await resolveIds({ tables, activityId: "activity-1", now: noon });
        expect(edge).toEqual(web);
        expect(web.menus.map(m => [m.catalogId, m.state, m.startMinute, m.endMinute, m.sortOrder])).toEqual([
            ["catalog-wine", "now", 0, 1440, 1],
            ["catalog-lunch", "now", 0, 1440, 2],
            ["catalog-xmas", "later", 1140, 1380, 3]
        ]);
        expect(web.layout.catalogId).toBe("catalog-wine");
        expect(web.layoutCandidateCount).toBe(3);

        const evening = toRomeDateTime(new Date("2026-03-26T19:00:00.000Z"));
        const later = await resolveIds({ tables, activityId: "activity-1", now: evening });
        // Alle 20 «xmas» copre gli «insieme»; dalle 23 tornano, più tardi oggi.
        expect(later.web.menus.map(m => [m.catalogId, m.state, m.startMinute])).toEqual([
            ["catalog-xmas", "now", 1140],
            ["catalog-wine", "later", 1380],
            ["catalog-lunch", "later", 1380]
        ]);
    });

    it("16. giudice nuovo: prezzi, disponibilità e in evidenza si sommano, il più preciso per primo", async () => {
        const tables: TableRows = {
            activity_group_members: [],
            schedule_targets: [
                { schedule_id: "price-seat", target_type: "activity", target_id: "activity-1" }
            ],
            schedule_layout: [],
            schedules: [
                buildSchedule({ id: "price-all", rule_type: "price", apply_to_all: true }),
                buildSchedule({ id: "price-seat", rule_type: "price", created_at: "2025-01-01T00:00:00.000Z" }),
                buildSchedule({ id: "vis-a", rule_type: "visibility", apply_to_all: true, visibility_mode: "disable" }),
                buildSchedule({
                    id: "vis-b",
                    rule_type: "visibility",
                    apply_to_all: true,
                    created_at: "2026-02-01T00:00:00.000Z"
                }),
                buildSchedule({ id: "feat-a", rule_type: "featured", apply_to_all: true }),
                buildSchedule({ id: "feat-b", rule_type: "featured", apply_to_all: true, created_at: "2026-02-01T00:00:00.000Z" })
            ]
        };
        const noon = toRomeDateTime(new Date("2026-03-26T12:00:00.000Z"));
        const { web, edge } = await resolveIds({ tables, activityId: "activity-1", now: noon });
        expect(edge).toEqual(web);
        expect(web.priceRuleIds).toEqual(["price-seat", "price-all"]);
        expect(web.priceRuleId).toBe("price-seat");
        expect(web.visibilityRules).toEqual([
            { scheduleId: "vis-b", mode: "hide" },
            { scheduleId: "vis-a", mode: "disable" }
        ]);
        expect(web.featuredRuleIds).toEqual(["feat-b", "feat-a"]);
    });

    it("17. ruleTypes layout+price (ordini): menù e prezzi, niente «più tardi» né altri strati", async () => {
        const fakeSupabase = createFakeSupabase(withBridgeSlots(MIXED_FIXTURE));
        const now = toRomeDateTime(new Date("2026-03-26T12:00:00.000Z"));
        const params = { supabase: fakeSupabase, activityId: "activity-1", tenantId: TEST_TENANT_ID, now };
        const web = await resolveWebRules({ ...params, ruleTypes: ["layout", "price"] });
        const edge = await resolveEdgeRules({ ...params, ruleTypes: ["layout", "price"] });
        expect(edge).toEqual(web);
        expect(web.layout.catalogId).toBe("catalog-a");
        expect(web.menus.every(m => m.state === "now")).toBe(true);
        expect(web.priceRuleId).toBe("dated-price");
        expect(web.visibilityRules).toEqual([]);
        expect(web.featuredRuleIds).toEqual([]);
    });

    it("18. giudice nuovo: una regola di stile copre lo stile del menù, il menù resta", async () => {
        const styleOf = (id: string) => ({ id, name: `Stile ${id}`, current_version: { config: { id } } });
        const tables: TableRows = {
            activity_group_members: [],
            schedule_targets: [],
            schedule_layout: [{ schedule_id: "base", catalog_id: "catalog-base", style: styleOf("style-base") }],
            schedule_style: [{ schedule_id: "evening", style_id: "style-evening", style: styleOf("style-evening") }],
            schedules: [
                buildSchedule({ id: "base", rule_type: "layout", apply_to_all: true }),
                {
                    ...buildSchedule({
                        id: "evening",
                        rule_type: "layout",
                        apply_to_all: true,
                        time_mode: "window",
                        created_at: "2026-02-01T00:00:00.000Z"
                    }),
                    rule_type: "style"
                }
            ],
            schedule_slots: [
                { id: "s-e", schedule_id: "evening", days_of_week: null, start_minute: 1140, end_minute: 1440, sort_order: 0 }
            ]
        };
        const fakeSupabase = createFakeSupabase(tables);
        const resolveAt = async (iso: string) => {
            const params = {
                supabase: fakeSupabase,
                activityId: "activity-1",
                tenantId: TEST_TENANT_ID,
                now: toRomeDateTime(new Date(iso)),
                includeLayoutStyle: true
            };
            const web = await resolveWebRules(params);
            expect(await resolveEdgeRules(params)).toEqual(web);
            return web;
        };
        const noon = await resolveAt("2026-03-26T12:00:00.000Z");
        expect([noon.layout.catalogId, noon.layout.styleData?.id, noon.styleScheduleId]).toEqual([
            "catalog-base",
            "style-base",
            "base"
        ]);
        const evening = await resolveAt("2026-03-26T19:00:00.000Z");
        expect([evening.layout.catalogId, evening.layout.styleData?.id, evening.styleScheduleId]).toEqual([
            "catalog-base",
            "style-evening",
            "evening"
        ]);
        expect(evening.layout.styleData?.config).toEqual({ id: "style-evening" });
    });

    it("19. giudice nuovo: fra le layout l'ordine di oggi, «Fascia 00:00-23:59» (fascia 0-1440 dal ponte) prima di «Sempre»", async () => {
        const tables: TableRows = {
            activity_group_members: [],
            schedule_targets: [],
            schedule_layout: [
                { schedule_id: "whole-day", catalog_id: "catalog-day", style: null },
                { schedule_id: "always", catalog_id: "catalog-always", style: null }
            ],
            schedules: [
                buildSchedule({
                    id: "whole-day",
                    rule_type: "layout",
                    apply_to_all: true,
                    time_mode: "window",
                    time_from: "00:00:00",
                    time_to: "23:59:00",
                    priority: 20
                }),
                buildSchedule({ id: "always", rule_type: "layout", apply_to_all: true, priority: 1 })
            ],
            schedule_slots: [
                { id: "s-day", schedule_id: "whole-day", days_of_week: null, start_minute: 0, end_minute: 1440, sort_order: 0 }
            ]
        };
        const now = toRomeDateTime(new Date("2026-03-26T12:00:00.000Z"));
        const { web, edge } = await resolveIds({ tables, activityId: "activity-1", now });
        expect(edge).toEqual(web);
        const expected = resolveCompetition(competitionRulesFromTables(tables), { activityId: "activity-1", groupIds: [] }, now);
        expect(expected.layout.winner?.rule.id).toBe("whole-day");
        expect(web.layout.scheduleId).toBe("whole-day");
    });
});

/* ─── Fixtures of the numbered cases (also fed to the bridge, case 12) ─── */

const TEMPORAL_FIXTURE: TableRows = {
    activity_group_members: [],
    schedule_targets: [
        { schedule_id: "always-layout", target_type: "activity", target_id: "activity-1" },
        { schedule_id: "lunch-layout", target_type: "activity", target_id: "activity-1" }
    ],
    schedule_layout: [
        { schedule_id: "always-layout", catalog_id: "catalog-always" },
        { schedule_id: "lunch-layout", catalog_id: "catalog-lunch" }
    ],
    schedules: [
        buildSchedule({ id: "always-layout", rule_type: "layout", priority: 1 }),
        buildSchedule({
            id: "lunch-layout",
            rule_type: "layout",
            priority: 30,
            created_at: "2026-02-01T00:00:00.000Z",
            time_mode: "window",
            time_from: "12:00",
            time_to: "15:00"
        })
    ]
};

const NO_CATALOG_FIXTURE: TableRows = {
    activity_group_members: [],
    schedule_targets: [{ schedule_id: "empty-layout", target_type: "activity", target_id: "activity-1" }],
    schedule_layout: [
        { schedule_id: "empty-layout", catalog_id: null },
        { schedule_id: "global-layout", catalog_id: "catalog-global" }
    ],
    schedules: [
        buildSchedule({ id: "empty-layout", rule_type: "layout" }),
        buildSchedule({ id: "global-layout", rule_type: "layout", apply_to_all: true })
    ]
};

const FEATURED_FIXTURE: TableRows = {
    activity_group_members: [{ group_id: "group-1", activity_id: "activity-2" }],
    schedule_targets: [
        { schedule_id: "featured-activity", target_type: "activity", target_id: "activity-1" },
        { schedule_id: "price-group", target_type: "activity_group", target_id: "group-1" }
    ],
    schedule_layout: [],
    schedules: [
        buildSchedule({ id: "featured-global", rule_type: "featured", apply_to_all: true, priority: 1 }),
        buildSchedule({ id: "featured-activity", rule_type: "featured", priority: 20 }),
        buildSchedule({ id: "price-group", rule_type: "price" }),
        buildSchedule({
            id: "vis-weekend",
            rule_type: "visibility",
            apply_to_all: true,
            time_mode: "window",
            days_of_week: [0, 6]
        })
    ]
};

const EMPTY_DAYS_FIXTURE: TableRows = {
    activity_group_members: [],
    schedule_targets: [{ schedule_id: "featured-empty-days", target_type: "activity", target_id: "activity-1" }],
    schedule_layout: [],
    schedules: [
        buildSchedule({
            id: "featured-empty-days",
            rule_type: "featured",
            time_mode: "window",
            days_of_week: [],
            time_from: "11:00",
            time_to: "15:00"
        }),
        buildSchedule({
            id: "featured-null-days",
            rule_type: "featured",
            apply_to_all: true,
            time_mode: "window",
            days_of_week: null,
            time_from: "11:00",
            time_to: "15:00"
        })
    ]
};

const MIXED_FIXTURE: TableRows = {
    activity_group_members: [
        { group_id: "group-1", activity_id: "activity-1" },
        { group_id: "group-1", activity_id: "activity-2" }
    ],
    schedule_targets: [
        { schedule_id: "group-dinner", target_type: "activity_group", target_id: "group-1" },
        { schedule_id: "sede-night", target_type: "activity", target_id: "activity-2" },
        { schedule_id: "dated-price", target_type: "activity", target_id: "activity-1" }
    ],
    schedule_layout: [
        { schedule_id: "global-always", catalog_id: "catalog-a" },
        { schedule_id: "group-dinner", catalog_id: "catalog-b" },
        { schedule_id: "sede-night", catalog_id: "catalog-c" }
    ],
    schedules: [
        buildSchedule({ id: "global-always", rule_type: "layout", apply_to_all: true }),
        buildSchedule({
            id: "group-dinner",
            rule_type: "layout",
            time_mode: "window",
            time_from: "19:00",
            time_to: "23:00"
        }),
        buildSchedule({
            id: "sede-night",
            rule_type: "layout",
            time_mode: "window",
            days_of_week: [0],
            time_from: "00:00",
            time_to: "06:00"
        }),
        buildSchedule({
            id: "dated-price",
            rule_type: "price",
            time_mode: "window",
            start_at: "2026-03-01T00:00:00.000Z",
            end_at: "2026-04-01T00:00:00.000Z"
        }),
        buildSchedule({
            id: "open-ended-price",
            rule_type: "price",
            apply_to_all: true,
            time_mode: "window",
            start_at: "2026-01-01T00:00:00.000Z"
        }),
        buildSchedule({ id: "disabled-price", rule_type: "price", apply_to_all: true, enabled: false })
    ]
};

const BRIDGE_FIXTURES: Record<string, TableRows> = {
    temporal: TEMPORAL_FIXTURE,
    noCatalog: NO_CATALOG_FIXTURE,
    featured: FEATURED_FIXTURE,
    emptyDays: EMPTY_DAYS_FIXTURE,
    mixed: MIXED_FIXTURE
};

/**
 * The same tables, read the way Programmazione reads them: one rule with its
 * targets, no query. Only the bridge (case 12) uses it.
 */
function competitionRulesFromTables(tables: TableRows): CompetitionRule[] {
    const targets = tables.schedule_targets ?? [];
    const layouts = tables.schedule_layout ?? [];
    return (tables.schedules ?? [])
        .filter(row => row.tenant_id === TEST_TENANT_ID)
        .map(row => {
            const own = targets.filter(target => target.schedule_id === row.id);
            return {
                id: String(row.id),
                rule_type: row.rule_type as CompetitionRule["rule_type"],
                enabled: Boolean(row.enabled),
                priority: Number(row.priority),
                created_at: String(row.created_at),
                time_mode: row.time_mode as CompetitionRule["time_mode"],
                days_of_week: row.days_of_week as number[] | null,
                time_from: row.time_from as string | null,
                time_to: row.time_to as string | null,
                start_at: row.start_at as string | null,
                end_at: row.end_at as string | null,
                applyToAll: Boolean(row.apply_to_all),
                activityIds: own.filter(t => t.target_type === "activity").map(t => String(t.target_id)),
                groupIds: own.filter(t => t.target_type === "activity_group").map(t => String(t.target_id)),
                hasPayload:
                    row.rule_type === "layout"
                        ? layouts.some(l => l.schedule_id === row.id && l.catalog_id != null)
                        : undefined
            };
        });
}

/** The same fixtures as the page loads them: `LayoutRule`, the matrix input. */
function layoutRulesFromTables(tables: TableRows): LayoutRule[] {
    const layouts = tables.schedule_layout ?? [];
    return competitionRulesFromTables(tables).map(rule => {
        const layout = layouts.find(l => l.schedule_id === rule.id);
        return {
            ...rule,
            tenant_id: TEST_TENANT_ID,
            name: rule.id,
            layout: layout ? { catalog_id: (layout.catalog_id as string | null) ?? null, style_id: "style-1" } : null,
            price_overrides: [],
            visibility_overrides: [],
            featured_contents: []
        } as unknown as LayoutRule;
    });
}
