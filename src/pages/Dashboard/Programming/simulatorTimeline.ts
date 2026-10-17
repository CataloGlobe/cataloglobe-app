import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import { judgeSeat, toJudgeRule } from "@/utils/judgeView";
import type { InsightRule } from "@/utils/ruleInsights";
import type { CompetitionSeat, RomeDateTime } from "@shared/scheduleCompetition";

/** Una regola della pagina, con quello che l'andamento mostra per ogni strato. */
export type TimelineRule = InsightRule & Pick<LayoutRule, "visibility_mode">;

export type DailyTimelineBlock = {
    startMinutes: number;
    endMinutes: number;
    /** Il primo menù in onda; tutti in `layoutCatalogIds` (più d'uno se «insieme»). */
    layoutCatalogId: string | null;
    layoutCatalogIds: string[];
    layoutScheduleId: string | null;
    /** Prezzi, disponibilità e in evidenza si sommano: la prima e tutte, in ordine di precedenza. */
    priceRuleId: string | null;
    priceRuleIds: string[];
    visibilityScheduleId: string | null;
    visibilityScheduleIds: string[];
    visibilityMode: "hide" | "disable" | null;
    /** I modi di tutte le disponibilità in onda (una nasconde, un'altra rende non disponibile). */
    visibilityModes: Array<"hide" | "disable">;
    featuredScheduleId: string | null;
    featuredScheduleIds: string[];
    layoutSpecificity: number | null;
    priceSpecificity: number | null;
    visibilitySpecificity: number | null;
};

type TimelineSlot = Omit<DailyTimelineBlock, "startMinutes" | "endMinutes">;

function slotKey(slot: TimelineSlot): string {
    return [
        slot.layoutCatalogIds.join(","),
        slot.layoutScheduleId ?? "",
        slot.priceRuleIds.join(","),
        slot.visibilityScheduleIds.join(","),
        slot.visibilityModes.join(","),
        slot.featuredScheduleIds.join(","),
        String(slot.layoutSpecificity ?? ""),
        String(slot.priceSpecificity ?? ""),
        String(slot.visibilitySpecificity ?? "")
    ].join("|");
}

/**
 * L'andamento della giornata di una sede: per ogni istante il giudice della
 * pagina pubblica (`judge`), sulle regole già caricate
 * dalla pagina — nessuna richiesta. Le mezz'ore con lo stesso esito
 * consecutive diventano un blocco.
 */
export function buildDailyTimeline<R extends TimelineRule>(
    rules: readonly R[],
    seat: CompetitionSeat,
    slots: ReadonlyArray<{ minutesOffset: number; now: RomeDateTime }>,
    stepMinutes: number
): DailyTimelineBlock[] {
    const judgeRules = rules.map(toJudgeRule);
    const blocks: DailyTimelineBlock[] = [];

    for (const { minutesOffset, now } of slots) {
        const outcome = judgeSeat(judgeRules, seat, now);
        const layout = outcome.layout.shown[0];
        const price = outcome.price.shown[0];
        const visibility = outcome.visibility.shown[0];
        const catalogIds = outcome.layout.shown
            .map(entry => entry.rule.source.layout?.catalog_id ?? null)
            .filter((id): id is string => id !== null);
        const modeOf = (entry: (typeof outcome.visibility.shown)[number]): "hide" | "disable" =>
            entry.rule.source.visibility_mode === "disable" ? "disable" : "hide";
        const slot: TimelineSlot = {
            layoutCatalogId: catalogIds[0] ?? null,
            layoutCatalogIds: catalogIds,
            layoutScheduleId: layout?.rule.id ?? null,
            priceRuleId: price?.rule.id ?? null,
            priceRuleIds: outcome.price.shown.map(entry => entry.rule.id),
            visibilityScheduleId: visibility?.rule.id ?? null,
            visibilityScheduleIds: outcome.visibility.shown.map(entry => entry.rule.id),
            visibilityMode: visibility ? modeOf(visibility) : null,
            visibilityModes: [...new Set(outcome.visibility.shown.map(modeOf))],
            featuredScheduleId: outcome.featured.shown[0]?.rule.id ?? null,
            featuredScheduleIds: outcome.featured.shown.map(entry => entry.rule.id),
            layoutSpecificity: layout?.specificity ?? null,
            priceSpecificity: price?.specificity ?? null,
            visibilitySpecificity: visibility?.specificity ?? null
        };

        const last = blocks[blocks.length - 1];
        if (last && slotKey(last) === slotKey(slot) && last.endMinutes === minutesOffset) {
            last.endMinutes += stepMinutes;
            continue;
        }
        blocks.push({ ...slot, startMinutes: minutesOffset, endMinutes: minutesOffset + stepMinutes });
    }

    return blocks;
}
