import type { LayoutRule, LayoutRuleOption } from "@/services/supabase/layoutScheduling";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";
import { isViewRuleActiveNow, judgeSeat, toJudgeRule, VIEW_LAYERS, type JudgeViewRule } from "@/utils/judgeView";
import { describeZeroReach, ruleReachesAnyActivity } from "@/utils/scheduleReach";
import type { CompetitionSeat } from "@shared/scheduleCompetition";

export type RuleInsight = {
    isActiveNow: boolean;
    isOverridden: boolean;
    isNeverUsed: boolean;
    /** Motivo della portata zero (Passo 4), presente sse isNeverUsed. */
    zeroReachReason?: string;
    /** La regola che adesso vince su questa (nome e id, per il link). */
    overriddenByName?: string;
    overriddenById?: string;
    /** Nomi delle sedi dove questa regola è coperta (da una più specifica, o da un menù «al posto degli altri»). */
    excludedActivityNames?: string[];
    /** Le stesse sedi, con chi vince in ciascuna: la riga ambra dell'elenco (PG5). */
    losingSeats?: Array<{ activityId: string; activityName: string; winnerId: string; winnerName: string }>;
};

/**
 * Quello che serve di una regola per la competizione e la portata: una
 * `LayoutRule` di Programmazione, o la forma minima caricata altrove (drawer
 * di eliminazione stile).
 */
export type InsightRule = JudgeViewRule;

export type RuleInsightsInput<R extends InsightRule = LayoutRule> = {
    rules: R[];
    activities: Array<Pick<LayoutRuleOption, "id" | "name">>;
    activityIdsByGroupId: Record<string, string[]>;
    groupNameById: Map<string, string>;
    /** La sede del filtro della navbar, se c'è. */
    filterActivityId: string | null;
    now: Date;
    ruleName: (rule: R) => string;
};

/**
 * «Adesso» e «Sovrascritta da» per ogni regola, col giudice della pagina
 * pubblica (`judge`), sede per sede, all'ora di Roma. Col filtro sede si
 * gioca solo sulla sede filtrata.
 *
 * Una regola è sovrascritta se è attiva e, sulle sedi considerate, è coperta
 * ovunque partecipi: un menù da un «al posto degli altri» (o una `layout` da
 * quella che vince con l'ordine di oggi), uno stile da quello che vince.
 * Prezzi, disponibilità e in evidenza si sommano: nessuna copre l'altra.
 * `overriddenBy*` è chi copre nella prima sede (nell'ordine delle sedi) dove
 * è coperta; `excludedActivityNames` sono tutte le sedi dove lo è.
 */
export function computeRuleInsights<R extends InsightRule>(input: RuleInsightsInput<R>): Map<string, RuleInsight> {
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

    const judgeRules = rules.map(toJudgeRule);
    const ruleWinsNow = new Set<string>();
    const ruleParticipatesNow = new Set<string>();
    const ruleOverriddenBy = new Map<string, R>();
    const ruleExcludedActivityIds = new Map<string, string[]>();
    const ruleLosingSeats = new Map<string, Array<{ activityId: string; winner: R }>>();

    for (const seat of seats) {
        const outcome = judgeSeat(judgeRules, seat, nowRome);
        // Una regola in onda in uno strato (una layout che dà il menù ma non lo
        // stile) in questa sede non è coperta.
        const shownHere = new Set<string>();
        for (const layer of VIEW_LAYERS) {
            for (const entry of outcome[layer].shown) {
                shownHere.add(entry.rule.id);
                ruleWinsNow.add(entry.rule.id);
                ruleParticipatesNow.add(entry.rule.id);
            }
        }
        const coveredHere = new Set<string>();
        for (const layer of VIEW_LAYERS) {
            for (const { entry, by } of outcome[layer].covered) {
                const id = entry.rule.id;
                ruleParticipatesNow.add(id);
                if (shownHere.has(id) || coveredHere.has(id)) continue;
                coveredHere.add(id);
                if (!ruleOverriddenBy.has(id)) ruleOverriddenBy.set(id, by.rule.source);
                const excluded = ruleExcludedActivityIds.get(id) ?? [];
                excluded.push(seat.activityId);
                ruleExcludedActivityIds.set(id, excluded);
                const losing = ruleLosingSeats.get(id) ?? [];
                losing.push({ activityId: seat.activityId, winner: by.rule.source });
                ruleLosingSeats.set(id, losing);
            }
        }
    }

    const insights = new Map<string, RuleInsight>();
    for (const rule of rules) {
        const isActiveNow = isViewRuleActiveNow(rule, nowRome);
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
            excludedActivityNames: excludedIds?.map(id => activityById.get(id)?.name ?? id),
            losingSeats: ruleLosingSeats.get(rule.id)?.map(({ activityId, winner }) => ({
                activityId,
                activityName: activityById.get(activityId)?.name ?? activityId,
                winnerId: winner.id,
                winnerName: ruleName(winner)
            }))
        });
    }

    return insights;
}
