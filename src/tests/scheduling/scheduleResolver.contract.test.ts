import { describe, expect, it } from "vitest";
import { resolveRulesForActivity as resolveWebRules } from "@/services/supabase/scheduleResolver";
import { resolveRulesForActivity as resolveEdgeRules } from "../../../supabase/functions/_shared/scheduleResolver";
import { toRomeDateTime, type RomeDateTime } from "@/services/supabase/schedulingNow";

type TableRows = Record<string, Array<Record<string, unknown>>>;
type UiRuleType = "layout" | "price" | "visibility";

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
});
