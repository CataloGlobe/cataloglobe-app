import { describe, expect, it } from "vitest";
import { resolveRulesForActivity as resolveWebRules } from "@/services/supabase/scheduleResolver";
import { resolveRulesForActivity as resolveEdgeRules } from "@shared/scheduleResolver";
import { resolveCompetition, type CompetitionRule } from "@shared/scheduleCompetition";
import { toRomeDateTime, type RomeDateTime } from "@/services/supabase/schedulingNow";

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
                style: []
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

async function resolveIds(params: {
    tables: TableRows;
    activityId: string;
    now: RomeDateTime;
}) {
    const fakeSupabase = createFakeSupabase(params.tables);
    const web = await resolveWebRules({
        supabase: fakeSupabase,
        activityId: params.activityId,
        tenantId: TEST_TENANT_ID,
        now: params.now,
        includeLayoutStyle: false
    });
    const edge = await resolveEdgeRules({
        supabase: fakeSupabase,
        activityId: params.activityId,
        tenantId: TEST_TENANT_ID,
        now: params.now,
        includeLayoutStyle: false
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
