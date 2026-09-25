import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import type { InsightRule } from "@/utils/ruleInsights";
import { toCompetitionRule } from "@/utils/ruleInsights";
import { resolveCompetition, type CompetitionSeat, type RomeDateTime } from "@shared/scheduleCompetition";

/** Una regola della pagina, con quello che l'andamento mostra per ogni strato. */
export type TimelineRule = InsightRule & Pick<LayoutRule, "visibility_mode">;

export type DailyTimelineBlock = {
    startMinutes: number;
    endMinutes: number;
    layoutCatalogId: string | null;
    layoutScheduleId: string | null;
    priceRuleId: string | null;
    visibilityScheduleId: string | null;
    visibilityMode: "hide" | "disable" | null;
    featuredScheduleId: string | null;
    layoutSpecificity: number | null;
    priceSpecificity: number | null;
    visibilitySpecificity: number | null;
};

type TimelineSlot = Omit<DailyTimelineBlock, "startMinutes" | "endMinutes">;

function slotKey(slot: TimelineSlot): string {
    return [
        slot.layoutCatalogId ?? "",
        slot.layoutScheduleId ?? "",
        slot.priceRuleId ?? "",
        slot.visibilityScheduleId ?? "",
        slot.visibilityMode ?? "",
        slot.featuredScheduleId ?? "",
        String(slot.layoutSpecificity ?? ""),
        String(slot.priceSpecificity ?? ""),
        String(slot.visibilitySpecificity ?? "")
    ].join("|");
}

/**
 * L'andamento della giornata di una sede: per ogni istante la competizione
 * della pagina pubblica (`resolveCompetition`), sulle regole già caricate
 * dalla pagina — nessuna richiesta. Le mezz'ore con lo stesso esito
 * consecutive diventano un blocco.
 */
export function buildDailyTimeline<R extends TimelineRule>(
    rules: readonly R[],
    seat: CompetitionSeat,
    slots: ReadonlyArray<{ minutesOffset: number; now: RomeDateTime }>,
    stepMinutes: number
): DailyTimelineBlock[] {
    const competitionRules = rules.map(toCompetitionRule);
    const blocks: DailyTimelineBlock[] = [];

    for (const { minutesOffset, now } of slots) {
        const outcome = resolveCompetition(competitionRules, seat, now);
        const layout = outcome.layout.winner;
        const price = outcome.price.winner;
        const visibility = outcome.visibility.winner;
        const slot: TimelineSlot = {
            layoutCatalogId: layout?.rule.source.layout?.catalog_id ?? null,
            layoutScheduleId: layout?.rule.id ?? null,
            priceRuleId: price?.rule.id ?? null,
            visibilityScheduleId: visibility?.rule.id ?? null,
            visibilityMode: visibility ? (visibility.rule.source.visibility_mode === "disable" ? "disable" : "hide") : null,
            featuredScheduleId: outcome.featured.winner?.rule.id ?? null,
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
