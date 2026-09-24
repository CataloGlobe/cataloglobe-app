import type { LayoutRule, LayoutRuleOption } from "@/services/supabase/layoutScheduling";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";
import { describeZeroReach, ruleReachesAnyActivity } from "@/utils/scheduleReach";
import {
    COMPETITION_RULE_TYPES,
    isTimeRuleActiveNow,
    resolveCompetition,
    type CompetitionRule,
    type CompetitionSeat
} from "@shared/scheduleCompetition";

export type RuleInsight = {
    isActiveNow: boolean;
    isOverridden: boolean;
    isNeverUsed: boolean;
    /** Motivo della portata zero (Passo 4), presente sse isNeverUsed. */
    zeroReachReason?: string;
    /** La regola che adesso vince su questa (nome e id, per il link). */
    overriddenByName?: string;
    overriddenById?: string;
    /** Nomi delle sedi dove questa regola è sovrascritta da una più specifica. */
    excludedActivityNames?: string[];
};

export type RuleInsightsInput = {
    rules: LayoutRule[];
    activities: Array<Pick<LayoutRuleOption, "id" | "name">>;
    activityIdsByGroupId: Record<string, string[]>;
    groupNameById: Map<string, string>;
    /** La sede del filtro della navbar, se c'è. */
    filterActivityId: string | null;
    now: Date;
    ruleName: (rule: LayoutRule) => string;
};

/** La regola della lista nella forma della competizione (targets da schedule_targets). */
export function toCompetitionRule(rule: LayoutRule): CompetitionRule & { source: LayoutRule } {
    return {
        id: rule.id,
        rule_type: rule.rule_type,
        enabled: rule.enabled,
        priority: rule.priority,
        created_at: rule.created_at,
        time_mode: rule.time_mode,
        days_of_week: rule.days_of_week,
        time_from: rule.time_from,
        time_to: rule.time_to,
        start_at: rule.start_at,
        end_at: rule.end_at,
        applyToAll: rule.applyToAll,
        activityIds: rule.activityIds,
        groupIds: rule.groupIds,
        hasPayload: rule.rule_type === "layout" ? (rule.layout?.catalog_id ?? null) !== null : undefined,
        source: rule
    };
}

/**
 * «Adesso» e «Sovrascritta da» per ogni regola, con la stessa competizione
 * della pagina pubblica (`resolveCompetition`), sede per sede, all'ora di
 * Roma. Col filtro sede si gioca solo sulla sede filtrata.
 *
 * Una regola è sovrascritta se è in finestra e, sulle sedi considerate,
 * perde ovunque partecipi. `overriddenBy*` è il vincitore della prima sede
 * (nell'ordine delle sedi) dove perde; `excludedActivityNames` sono tutte
 * le sedi dove perde.
 */
export function computeRuleInsights(input: RuleInsightsInput): Map<string, RuleInsight> {
    const { rules, activities, activityIdsByGroupId, groupNameById, filterActivityId, now, ruleName } = input;
    const nowRome = toRomeDateTime(now);
    const activityById = new Map(activities.map(activity => [activity.id, activity]));
    const reachCtx = {
        activityExists: (id: string) => activityById.has(id),
        groupMemberCount: (id: string) => (activityIdsByGroupId[id] ?? []).length
    };

    const groupIdsByActivityId = new Map<string, string[]>();
    for (const [groupId, memberIds] of Object.entries(activityIdsByGroupId)) {
        for (const activityId of memberIds) {
            const current = groupIdsByActivityId.get(activityId) ?? [];
            current.push(groupId);
            groupIdsByActivityId.set(activityId, current);
        }
    }
    const seatIds = filterActivityId ? [filterActivityId] : activities.map(activity => activity.id);
    const seats: CompetitionSeat[] = seatIds.map(activityId => ({
        activityId,
        groupIds: groupIdsByActivityId.get(activityId) ?? []
    }));

    const competitionRules = rules.map(toCompetitionRule);
    const ruleWinsNow = new Set<string>();
    const ruleParticipatesNow = new Set<string>();
    const ruleOverriddenBy = new Map<string, LayoutRule>();
    const ruleExcludedActivityIds = new Map<string, string[]>();

    for (const seat of seats) {
        const outcome = resolveCompetition(competitionRules, seat, nowRome);
        for (const type of COMPETITION_RULE_TYPES) {
            const { winner, contenders } = outcome[type];
            if (!winner) continue;
            ruleWinsNow.add(winner.rule.id);
            ruleParticipatesNow.add(winner.rule.id);
            for (const loser of contenders) {
                ruleParticipatesNow.add(loser.rule.id);
                if (!ruleOverriddenBy.has(loser.rule.id)) {
                    ruleOverriddenBy.set(loser.rule.id, winner.rule.source);
                }
                const excluded = ruleExcludedActivityIds.get(loser.rule.id) ?? [];
                excluded.push(seat.activityId);
                ruleExcludedActivityIds.set(loser.rule.id, excluded);
            }
        }
    }

    const insights = new Map<string, RuleInsight>();
    for (const rule of rules) {
        const isActiveNow = rule.enabled && isTimeRuleActiveNow(rule, nowRome);
        const canTargetAnyActivity = ruleReachesAnyActivity(rule, reachCtx);
        const overriddenBy = ruleOverriddenBy.get(rule.id);
        const excludedIds = ruleExcludedActivityIds.get(rule.id);

        insights.set(rule.id, {
            isActiveNow,
            isOverridden: isActiveNow && ruleParticipatesNow.has(rule.id) && !ruleWinsNow.has(rule.id),
            isNeverUsed: !canTargetAnyActivity,
            zeroReachReason: canTargetAnyActivity
                ? undefined
                : describeZeroReach(rule, { ...reachCtx, groupName: id => groupNameById.get(id) ?? id }),
            overriddenByName: overriddenBy ? ruleName(overriddenBy) : undefined,
            overriddenById: overriddenBy?.id,
            excludedActivityNames: excludedIds?.map(id => activityById.get(id)?.name ?? id)
        });
    }

    return insights;
}
