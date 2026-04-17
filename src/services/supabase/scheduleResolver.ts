// ⚠️ SYNC: questo file è duplicato. L'altra copia è in src/services/supabase/scheduleResolver.ts.
// Qualsiasi modifica va replicata in ENTRAMBI i file.

export type VisibilityMode = "hide" | "disable";

/**
 * Rome wall-clock instant. Defined inline to keep both resolver copies
 * byte-identical without a cross-module import.
 * Primary source of truth: schedulingNow.ts (RomeDateTime).
 */
type RomeDateTime = {
    /** True UTC epoch — use for start_at/end_at comparisons. */
    epoch: number;
    year: number;
    /** 0-based. */
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    /** 0 = domenica … 6 = sabato. */
    dayOfWeek: number;
};

type RuleType = "layout" | "price" | "visibility" | "featured";
type RuleSpecificity = 0 | 1 | 2;

type TimeRuleRow = {
    id: string;
    priority: number;
    created_at: string;
    time_mode: "always" | "window";
    days_of_week: number[] | null;
    time_from: string | null;
    time_to: string | null;
    start_at: string | null;
    end_at: string | null;
};

type RawActivityGroupMemberRow = {
    group_id: string;
};

type RawScheduleTargetRow = {
    schedule_id: string;
};

type RawLayoutRuleRow = TimeRuleRow & {
    layout:
        | {
              catalog_id: string | null;
              style?: {
                  id: string;
                  name: string;
                  current_version:
                      | {
                            config: unknown;
                        }
                      | Array<{
                            config: unknown;
                        }>
                      | null;
              }[];
          }
        | Array<{
              catalog_id: string | null;
              style?: {
                  id: string;
                  name: string;
                  current_version:
                      | {
                            config: unknown;
                        }
                      | Array<{
                            config: unknown;
                        }>
                      | null;
              }[];
          }>
        | null;
};

type CandidateInfo = {
    rows: CandidateRuleRow[];
    activityCount: number;
    groupCount: number;
    applyAllCount: number;
    targetedCount: number;
};

type CandidateRuleRow = TimeRuleRow & {
    specificity: RuleSpecificity;
};

type SupabaseLike = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (table: string) => any;
};

export type ResolveRulesForActivityParams = {
    supabase: SupabaseLike;
    activityId: string;
    tenantId: string;
    now: RomeDateTime;
    includeLayoutStyle?: boolean;
    ruleTypes?: RuleType[];
};

export type ResolveRulesForActivityResult = {
    layout: {
        catalogId: string | null;
        scheduleId: string | null;
        styleData?: {
            id: string;
            name: string;
            config?: unknown;
        };
    };
    priceRuleId: string | null;
    visibilityRule: {
        scheduleId: string;
        mode: VisibilityMode;
    } | null;
    featuredRule: {
        scheduleId: string;
    } | null;
    debug?: {
        candidatesCount: number;
        selectedLayoutRuleId: string | null;
        selectedLayoutRuleSpecificity: RuleSpecificity | null;
        selectedPriceRuleId: string | null;
        selectedPriceRuleSpecificity: RuleSpecificity | null;
        selectedVisibilityRuleId: string | null;
        selectedVisibilityRuleSpecificity: RuleSpecificity | null;
        selectedFeaturedRuleId: string | null;
        selectedFeaturedRuleSpecificity: RuleSpecificity | null;
    };
};

const TIME_RULE_SELECT = `
    id,
    priority,
    created_at,
    time_mode,
    days_of_week,
    time_from,
    time_to,
    start_at,
    end_at
`;

/**
 * Resolver contract (single source of truth):
 * - Precedence: specificity_first only
 *   activity (2) > activity_group (1) > apply_to_all (0),
 *   then priority ASC, created_at ASC, id ASC.
 * - Time: uses `now` passed by caller; caller must provide Europe/Rome-normalized
 *   "now" when evaluating runtime behavior.
 * - Targets:
 *   apply_to_all=true means global scope and wins over any malformed specific
 *   target attached to the same schedule id (defensive hardening).
 *   apply_to_all=false requires at least one explicit target match to participate.
 */

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toMinutes(hhmm: string | null): number | null {
    if (!hhmm) return null;
    const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
}

function isMissingColumnError(error: unknown, column: string): boolean {
    if (!error || typeof error !== "object") return false;
    const message = String((error as { message?: string }).message ?? "").toLowerCase();
    const needle = column.toLowerCase();
    return (
        message.includes(needle) &&
        (message.includes("column") ||
            message.includes("schema cache") ||
            message.includes("does not exist"))
    );
}

function compareByPriorityThenCreatedThenId(a: TimeRuleRow, b: TimeRuleRow): number {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const createdDelta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (createdDelta !== 0) return createdDelta;
    return a.id.localeCompare(b.id);
}

function temporalScore(rule: TimeRuleRow): number {
    let score = 0;
    if (rule.start_at || rule.end_at) score += 4;
    if (rule.time_from && rule.time_to) score += 2;
    if (rule.days_of_week && rule.days_of_week.length > 0) score += 1;
    return score;
}

function compareSpecificityFirst(a: CandidateRuleRow, b: CandidateRuleRow): number {
    // 1. Specificità target (activity > group > all)
    if (a.specificity !== b.specificity) {
        return b.specificity - a.specificity;
    }
    // 2. Specificità temporale (più vincoli = più specifico)
    const tA = temporalScore(a);
    const tB = temporalScore(b);
    if (tA !== tB) return tB - tA;
    // 3. Priority numerico (tiebreaker legacy)
    return compareByPriorityThenCreatedThenId(a, b);
}

export function isTimeRuleActiveNow(
    rule: Pick<TimeRuleRow, "time_mode" | "days_of_week" | "time_from" | "time_to" | "start_at" | "end_at">,
    now: RomeDateTime
): boolean {
    if (rule.start_at || rule.end_at) {
        if (rule.start_at && now.epoch < new Date(rule.start_at).getTime()) {
            return false;
        }
        if (rule.end_at && now.epoch >= new Date(rule.end_at).getTime()) {
            return false;
        }
        // Window rules with start_at but no end_at are open-ended date ranges —
        // exclude them to prevent stale rules from winning indefinitely via temporal score.
        if (rule.time_mode === "window" && rule.start_at && !rule.end_at) {
            return false;
        }
    }

    if (rule.time_mode === "always") return true;

    const day = now.dayOfWeek;
    const nowMinutes = now.hour * 60 + now.minute;

    if (rule.days_of_week !== null && !rule.days_of_week.includes(day)) {
        return false;
    }

    if (!rule.time_from || !rule.time_to) {
        return true;
    }

    const from = toMinutes(rule.time_from);
    const to = toMinutes(rule.time_to);
    if (from === null || to === null) return false;

    return from <= nowMinutes && nowMinutes < to;
}

async function listCandidateRuleRowsForActivity(
    supabase: SupabaseLike,
    ruleType: RuleType,
    activityId: string,
    tenantId: string
): Promise<CandidateInfo> {
    const [groupMembersRes, activityRulesRes] = await Promise.all([
        supabase.from("activity_group_members").select("group_id").eq("activity_id", activityId),
        supabase
            .from("schedules")
            .select(TIME_RULE_SELECT)
            .eq("tenant_id", tenantId)
            .eq("rule_type", ruleType)
            .eq("enabled", true)
            .eq("target_type", "activity")
            .eq("target_id", activityId)
    ]);

    if (groupMembersRes.error) throw groupMembersRes.error;
    if (activityRulesRes.error) throw activityRulesRes.error;

    const groupIds = Array.from(
        new Set(
            ((groupMembersRes.data ?? []) as RawActivityGroupMemberRow[]).map(row => row.group_id)
        )
    );

    let groupRows: TimeRuleRow[] = [];
    if (groupIds.length > 0) {
        const groupRulesRes = await supabase
            .from("schedules")
            .select(TIME_RULE_SELECT)
            .eq("tenant_id", tenantId)
            .eq("rule_type", ruleType)
            .eq("enabled", true)
            .eq("target_type", "activity_group")
            .in("target_id", groupIds);
        if (groupRulesRes.error) throw groupRulesRes.error;
        groupRows = (groupRulesRes.data ?? []) as TimeRuleRow[];
    }

    let applyAllRows: TimeRuleRow[] = [];
    const applyAllRes = await supabase
        .from("schedules")
        .select(TIME_RULE_SELECT)
        .eq("tenant_id", tenantId)
        .eq("rule_type", ruleType)
        .eq("enabled", true)
        .eq("apply_to_all", true);
    if (applyAllRes.error) {
        if (!isMissingColumnError(applyAllRes.error, "apply_to_all")) {
            throw applyAllRes.error;
        }
    } else {
        applyAllRows = (applyAllRes.data ?? []) as TimeRuleRow[];
    }
    const applyAllIds = new Set(applyAllRows.map(row => row.id));

    const targetedSpecificityById = new Map<string, RuleSpecificity>();
    const activityTargetsRes = await supabase
        .from("schedule_targets")
        .select("schedule_id")
        .eq("target_type", "activity")
        .eq("target_id", activityId);

    if (activityTargetsRes.error) {
        if (!isMissingColumnError(activityTargetsRes.error, "schedule_targets")) {
            throw activityTargetsRes.error;
        }
    } else {
        for (const row of (activityTargetsRes.data ?? []) as RawScheduleTargetRow[]) {
            targetedSpecificityById.set(row.schedule_id, 2);
        }
    }

    if (groupIds.length > 0) {
        const groupTargetsRes = await supabase
            .from("schedule_targets")
            .select("schedule_id")
            .eq("target_type", "activity_group")
            .in("target_id", groupIds);

        if (groupTargetsRes.error) {
            if (!isMissingColumnError(groupTargetsRes.error, "schedule_targets")) {
                throw groupTargetsRes.error;
            }
        } else {
            for (const row of (groupTargetsRes.data ?? []) as RawScheduleTargetRow[]) {
                const current = targetedSpecificityById.get(row.schedule_id) ?? 0;
                targetedSpecificityById.set(
                    row.schedule_id,
                    current > 1 ? current : 1
                );
            }
        }
    }

    let targetedRows: TimeRuleRow[] = [];
    if (targetedSpecificityById.size > 0) {
        const targetedRes = await supabase
            .from("schedules")
            .select(TIME_RULE_SELECT)
            .eq("tenant_id", tenantId)
            .eq("rule_type", ruleType)
            .eq("enabled", true)
            .in("id", Array.from(targetedSpecificityById.keys()));
        if (targetedRes.error) throw targetedRes.error;
        targetedRows = (targetedRes.data ?? []) as TimeRuleRow[];
    }

    const rowsById = new Map<string, CandidateRuleRow>();
    const upsertCandidate = (row: TimeRuleRow, specificity: RuleSpecificity) => {
        const current = rowsById.get(row.id);
        if (!current || specificity > current.specificity) {
            rowsById.set(row.id, { ...row, specificity });
            return;
        }
        rowsById.set(row.id, { ...row, specificity: current.specificity });
    };

    for (const row of (activityRulesRes.data ?? []) as TimeRuleRow[]) {
        if (applyAllIds.has(row.id)) continue;
        upsertCandidate(row, 2);
    }
    for (const row of groupRows) {
        if (applyAllIds.has(row.id)) continue;
        upsertCandidate(row, 1);
    }
    for (const row of applyAllRows) {
        upsertCandidate(row, 0);
    }
    for (const row of targetedRows) {
        if (applyAllIds.has(row.id)) continue;
        upsertCandidate(row, targetedSpecificityById.get(row.id) ?? 0);
    }

    const rows = Array.from(rowsById.values())
        .filter(row => row.specificity > 0 || applyAllIds.has(row.id))
        .sort(compareSpecificityFirst);
    return {
        rows,
        activityCount: ((activityRulesRes.data ?? []) as TimeRuleRow[]).length,
        groupCount: groupRows.length,
        applyAllCount: applyAllRows.length,
        targetedCount: targetedRows.length
    };
}

function orderRowsByCandidateIds<T extends { id: string }>(rows: T[], candidateIds: string[]): T[] {
    const rowsById = new Map(rows.map(row => [row.id, row]));
    return candidateIds.map(id => rowsById.get(id)).filter((row): row is T => row !== undefined);
}

function getRuleSpecificity(
    rows: CandidateRuleRow[],
    ruleId: string | null | undefined
): RuleSpecificity | null {
    if (!ruleId) return null;
    const row = rows.find(candidate => candidate.id === ruleId);
    return row?.specificity ?? null;
}

async function getVisibilityModeForSchedule(
    supabase: SupabaseLike,
    scheduleId: string,
    tenantId: string
): Promise<VisibilityMode> {
    const { data, error } = await supabase
        .from("schedules")
        .select("visibility_mode")
        .eq("tenant_id", tenantId)
        .eq("id", scheduleId)
        .maybeSingle();

    if (error) {
        if (isMissingColumnError(error, "visibility_mode")) return "hide";
        throw error;
    }

    const value = (data as { visibility_mode?: string | null } | null)?.visibility_mode;
    return value === "disable" ? "disable" : "hide";
}

function buildLayoutSelect(includeLayoutStyle: boolean): string {
    if (!includeLayoutStyle) {
        return `
            id,
            priority,
            created_at,
            time_mode,
            days_of_week,
            time_from,
            time_to,
            start_at,
            end_at,
            layout:schedule_layout!schedule_layout_schedule_id_fkey(
                catalog_id
            )
        `;
    }

    return `
        id,
        priority,
        created_at,
        time_mode,
        days_of_week,
        time_from,
        time_to,
        start_at,
        end_at,
        layout:schedule_layout!schedule_layout_schedule_id_fkey(
            catalog_id,
            style:styles(
                id,
                name,
                current_version:style_versions!styles_current_version_id_fkey(
                    config
                )
            )
        )
    `;
}

export async function resolveRulesForActivity(
    params: ResolveRulesForActivityParams
): Promise<ResolveRulesForActivityResult> {
    const {
        supabase,
        activityId,
        tenantId,
        now,
        includeLayoutStyle = false,
        ruleTypes
    } = params;
    const requestedTypes = new Set<RuleType>(ruleTypes ?? ["layout", "price", "visibility", "featured"]);
    const emptyCandidates: CandidateInfo = {
        rows: [],
        activityCount: 0,
        groupCount: 0,
        applyAllCount: 0,
        targetedCount: 0
    };
    const [layoutCandidates, priceCandidates, visibilityCandidates, featuredCandidates] = await Promise.all([
        requestedTypes.has("layout")
            ? listCandidateRuleRowsForActivity(supabase, "layout", activityId, tenantId)
            : Promise.resolve(emptyCandidates),
        requestedTypes.has("price")
            ? listCandidateRuleRowsForActivity(supabase, "price", activityId, tenantId)
            : Promise.resolve(emptyCandidates),
        requestedTypes.has("visibility")
            ? listCandidateRuleRowsForActivity(supabase, "visibility", activityId, tenantId)
            : Promise.resolve(emptyCandidates),
        requestedTypes.has("featured")
            ? listCandidateRuleRowsForActivity(supabase, "featured", activityId, tenantId)
            : Promise.resolve(emptyCandidates)
    ]);

    const layoutCandidateIds = layoutCandidates.rows.map(row => row.id);
    let layoutRows: RawLayoutRuleRow[] = [];
    if (layoutCandidateIds.length > 0) {
        const layoutRes = await supabase
            .from("schedules")
            .select(buildLayoutSelect(includeLayoutStyle))
            .eq("tenant_id", tenantId)
            .in("id", layoutCandidateIds);
        if (layoutRes.error) throw layoutRes.error;
        layoutRows = orderRowsByCandidateIds(
            (layoutRes.data ?? []) as RawLayoutRuleRow[],
            layoutCandidateIds
        );
    }

    const validLayoutRows = layoutRows.filter(row => isTimeRuleActiveNow(row, now));
    const selectedLayoutRule =
        validLayoutRows.find(row => (normalizeOne(row.layout)?.catalog_id ?? null) !== null) ??
        null;

    const selectedLayoutValue = normalizeOne(selectedLayoutRule?.layout);
    const selectedLayoutStyle = normalizeOne(selectedLayoutValue?.style);
    const selectedLayoutStyleVersion = normalizeOne(selectedLayoutStyle?.current_version);

    const validPriceRows = priceCandidates.rows.filter(row => isTimeRuleActiveNow(row, now));
    const selectedPriceRule = validPriceRows[0] ?? null;

    const validVisibilityRows = visibilityCandidates.rows.filter(row =>
        isTimeRuleActiveNow(row, now)
    );
    const selectedVisibilityRule = validVisibilityRows[0] ?? null;
    const visibilityRule = selectedVisibilityRule
        ? {
              scheduleId: selectedVisibilityRule.id,
              mode: await getVisibilityModeForSchedule(supabase, selectedVisibilityRule.id, tenantId)
          }
        : null;

    const selectedLayoutRuleSpecificity = getRuleSpecificity(
        layoutCandidates.rows,
        selectedLayoutRule?.id
    );
    const selectedPriceRuleSpecificity = getRuleSpecificity(
        priceCandidates.rows,
        selectedPriceRule?.id
    );
    const selectedVisibilityRuleSpecificity = getRuleSpecificity(
        visibilityCandidates.rows,
        selectedVisibilityRule?.id
    );

    const validFeaturedRows = featuredCandidates.rows.filter(row =>
        isTimeRuleActiveNow(row, now)
    );
    const selectedFeaturedRule = validFeaturedRows[0] ?? null;
    const selectedFeaturedRuleSpecificity = getRuleSpecificity(
        featuredCandidates.rows,
        selectedFeaturedRule?.id
    );

    return {
        layout: {
            catalogId: selectedLayoutValue?.catalog_id ?? null,
            scheduleId: selectedLayoutRule?.id ?? null,
            ...(selectedLayoutStyle
                ? {
                      styleData: {
                          id: selectedLayoutStyle.id,
                          name: selectedLayoutStyle.name,
                          ...(selectedLayoutStyleVersion?.config
                              ? { config: selectedLayoutStyleVersion.config }
                              : {})
                      }
                  }
                : {})
        },
        priceRuleId: selectedPriceRule?.id ?? null,
        visibilityRule,
        featuredRule: selectedFeaturedRule
            ? { scheduleId: selectedFeaturedRule.id }
            : null,
        debug: {
            candidatesCount:
                layoutCandidates.rows.length +
                priceCandidates.rows.length +
                visibilityCandidates.rows.length +
                featuredCandidates.rows.length,
            selectedLayoutRuleId: selectedLayoutRule?.id ?? null,
            selectedLayoutRuleSpecificity,
            selectedPriceRuleId: selectedPriceRule?.id ?? null,
            selectedPriceRuleSpecificity,
            selectedVisibilityRuleId: selectedVisibilityRule?.id ?? null,
            selectedVisibilityRuleSpecificity,
            selectedFeaturedRuleId: selectedFeaturedRule?.id ?? null,
            selectedFeaturedRuleSpecificity
        }
    };
}
