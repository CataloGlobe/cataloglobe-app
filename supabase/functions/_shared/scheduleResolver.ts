// ⚠️ SYNC: questo file è duplicato. L'altra copia è in src/services/supabase/scheduleResolver.ts.
// Qualsiasi modifica va replicata in ENTRAMBI i file: le due copie differiscono
// solo per questa intestazione e per il percorso dell'import qui sotto.
// La scelta di chi vince NON vive qui: è in _shared/scheduleCompetition.ts,
// file unico importato da entrambe. Qui restano le query.

import {
    isTimeRuleActiveNow,
    resolveCompetition,
    type CompetitionRule,
    type CompetitionSpecificity,
    type RomeDateTime
} from "./scheduleCompetition.ts";

export { isTimeRuleActiveNow };

export type VisibilityMode = "hide" | "disable";

type RuleType = "layout" | "price" | "visibility" | "featured";
type RuleSpecificity = CompetitionSpecificity;

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
    target_id?: string;
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
    /** Gruppi di cui la sede fa parte (activity_group_members). */
    seatGroupIds: string[];
    activityCount: number;
    groupCount: number;
    applyAllCount: number;
    targetedCount: number;
};

/** Una regola candidata per la sede, già nella forma di scheduleCompetition. */
type CandidateRuleRow = CompetitionRule;

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
    /** Numero di regole layout enabled=true associate alla sede, PRIMA del
     *  filtro temporale (`isTimeRuleActiveNow`) — distingue "nessuna regola
     *  mai configurata" da "regole configurate ma nessuna vince ora"
     *  (dayparting). Vedi `resolveActivityCatalogs.ts` → `hasConfiguredCatalogRule`. */
    layoutCandidateCount: number;
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
 * Resolver contract:
 * - Precedence and time window: resolveCompetition in
 *   _shared/scheduleCompetition.ts (single source of truth). In order:
 *   1. target specificity: activity (2) > activity_group (1) > apply_to_all (0);
 *   2. temporal specificity: more constraints win (date range 4, time
 *      window 2, days of week 1 — see temporalScore);
 *   3. priority ASC, created_at ASC, id ASC.
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

async function listCandidateRuleRowsForActivity(
    supabase: SupabaseLike,
    ruleType: RuleType,
    activityId: string,
    tenantId: string
): Promise<CandidateInfo> {
    const groupMembersRes = await supabase
        .from("activity_group_members")
        .select("group_id")
        .eq("activity_id", activityId);
    if (groupMembersRes.error) throw groupMembersRes.error;

    const groupIds = Array.from(
        new Set(
            ((groupMembersRes.data ?? []) as RawActivityGroupMemberRow[]).map(row => row.group_id)
        )
    );

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

    // Candidate selection is schedule_targets-only (passo 3): the inline
    // target_type/target_id columns are no longer read here. apply_to_all
    // still wins over any specific target on the same schedule: those rows
    // are read as global (specificityFor in scheduleCompetition).
    const activityTargetIds = new Set<string>();
    const activityTargetsRes = await supabase
        .from("schedule_targets")
        .select("schedule_id")
        .eq("target_type", "activity")
        .eq("target_id", activityId);
    if (activityTargetsRes.error) throw activityTargetsRes.error;
    for (const row of (activityTargetsRes.data ?? []) as RawScheduleTargetRow[]) {
        activityTargetIds.add(row.schedule_id);
    }

    const groupTargetIdsBySchedule = new Map<string, string[]>();
    if (groupIds.length > 0) {
        const groupTargetsRes = await supabase
            .from("schedule_targets")
            .select("schedule_id, target_id")
            .eq("target_type", "activity_group")
            .in("target_id", groupIds);
        if (groupTargetsRes.error) throw groupTargetsRes.error;
        for (const row of (groupTargetsRes.data ?? []) as RawScheduleTargetRow[]) {
            const current = groupTargetIdsBySchedule.get(row.schedule_id) ?? [];
            if (row.target_id) current.push(row.target_id);
            groupTargetIdsBySchedule.set(row.schedule_id, current);
        }
    }

    const targetedIds = new Set<string>([...activityTargetIds, ...groupTargetIdsBySchedule.keys()]);
    let targetedRows: TimeRuleRow[] = [];
    if (targetedIds.size > 0) {
        const targetedRes = await supabase
            .from("schedules")
            .select(TIME_RULE_SELECT)
            .eq("tenant_id", tenantId)
            .eq("rule_type", ruleType)
            .eq("enabled", true)
            .in("id", Array.from(targetedIds));
        if (targetedRes.error) throw targetedRes.error;
        targetedRows = (targetedRes.data ?? []) as TimeRuleRow[];
    }

    const toCandidate = (row: TimeRuleRow, applyToAll: boolean): CandidateRuleRow => ({
        ...row,
        rule_type: ruleType,
        enabled: true,
        applyToAll,
        activityIds: activityTargetIds.has(row.id) ? [activityId] : [],
        groupIds: groupTargetIdsBySchedule.get(row.id) ?? []
    });

    const rowsById = new Map<string, CandidateRuleRow>();
    for (const row of applyAllRows) {
        rowsById.set(row.id, toCandidate(row, true));
    }
    for (const row of targetedRows) {
        if (applyAllIds.has(row.id)) continue;
        rowsById.set(row.id, toCandidate(row, false));
    }

    let activityCount = 0;
    let groupCount = 0;
    for (const id of targetedIds) {
        if (activityTargetIds.has(id)) activityCount++;
        else groupCount++;
    }

    return {
        rows: Array.from(rowsById.values()),
        seatGroupIds: groupIds,
        activityCount,
        groupCount,
        applyAllCount: applyAllRows.length,
        targetedCount: targetedRows.length
    };
}

function orderRowsByCandidateIds<T extends { id: string }>(rows: T[], candidateIds: string[]): T[] {
    const rowsById = new Map(rows.map(row => [row.id, row]));
    return candidateIds.map(id => rowsById.get(id)).filter((row): row is T => row !== undefined);
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
        seatGroupIds: [],
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

    // Il payload del layout (catalogo, stile) serve prima della competizione:
    // una regola layout senza catalogo non vince, passa la successiva.
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
    const layoutRowById = new Map(layoutRows.map(row => [row.id, row]));
    const layoutRules = layoutCandidates.rows.map(row => ({
        ...row,
        hasPayload: (normalizeOne(layoutRowById.get(row.id)?.layout)?.catalog_id ?? null) !== null
    }));

    const outcome = resolveCompetition(
        [
            ...layoutRules,
            ...priceCandidates.rows,
            ...visibilityCandidates.rows,
            ...featuredCandidates.rows
        ],
        {
            activityId,
            groupIds: Array.from(
                new Set(
                    [layoutCandidates, priceCandidates, visibilityCandidates, featuredCandidates].flatMap(
                        info => info.seatGroupIds
                    )
                )
            )
        },
        now
    );

    const selectedLayoutRule = outcome.layout.winner
        ? (layoutRowById.get(outcome.layout.winner.rule.id) ?? null)
        : null;
    const selectedLayoutValue = normalizeOne(selectedLayoutRule?.layout);
    const selectedLayoutStyle = normalizeOne(selectedLayoutValue?.style);
    const selectedLayoutStyleVersion = normalizeOne(selectedLayoutStyle?.current_version);

    const selectedPriceRule = outcome.price.winner?.rule ?? null;
    const selectedVisibilityRule = outcome.visibility.winner?.rule ?? null;
    const visibilityRule = selectedVisibilityRule
        ? {
              scheduleId: selectedVisibilityRule.id,
              mode: await getVisibilityModeForSchedule(supabase, selectedVisibilityRule.id, tenantId)
          }
        : null;
    const selectedFeaturedRule = outcome.featured.winner?.rule ?? null;

    const selectedLayoutRuleSpecificity = outcome.layout.winner?.specificity ?? null;
    const selectedPriceRuleSpecificity = outcome.price.winner?.specificity ?? null;
    const selectedVisibilityRuleSpecificity = outcome.visibility.winner?.specificity ?? null;
    const selectedFeaturedRuleSpecificity = outcome.featured.winner?.specificity ?? null;

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
        layoutCandidateCount: layoutCandidates.rows.length,
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
