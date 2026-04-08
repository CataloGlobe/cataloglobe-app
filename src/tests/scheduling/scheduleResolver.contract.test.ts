import { describe, expect, it } from "vitest";
import { resolveRulesForActivity as resolveWebRules } from "@/services/supabase/scheduleResolver";
import { resolveRulesForActivity as resolveEdgeRules } from "../../../supabase/functions/_shared/scheduleResolver";
import { toRomeDateTime, type RomeDateTime } from "@/services/supabase/schedulingNow";

type TableRows = Record<string, Array<Record<string, unknown>>>;
type UiRuleType = "layout" | "price" | "visibility";

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
        now: params.now,
        includeLayoutStyle: false
    });
    const edge = await resolveEdgeRules({
        supabase: fakeSupabase,
        activityId: params.activityId,
        now: params.now,
        includeLayoutStyle: false
    });
    return { web, edge };
}

describe("Scheduling consistency contract", () => {
    it("web resolver and edge resolver return identical output", async () => {
        const tables: TableRows = {
            activity_group_members: [{ group_id: "group-1", activity_id: "activity-1" }],
            schedule_targets: [],
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
            schedule_targets: [],
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
            schedule_targets: [],
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
});
