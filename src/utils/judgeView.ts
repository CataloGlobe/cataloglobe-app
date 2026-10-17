import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import {
    isJudgeRuleActiveAnywhereAt,
    judge,
    temporalScore,
    type CompetitionSeat,
    type JudgeEntry,
    type JudgeRule,
    type JudgeRuleType,
    type JudgeSlot,
    type RomeDateTime
} from "@shared/scheduleCompetition";

/**
 * Le viste del back office (elenco, matrice, andamento, «dove appare») sul
 * giudice della pagina pubblica (`judge`, piano 9b passo 3d). Qui si passa da
 * una regola caricata dalla pagina alla forma del giudice, e dal verdetto agli
 * strati che le viste mostrano. Pura.
 */

/** Quello che serve di una regola per il giudice. */
export type JudgeViewRule = Pick<
    LayoutRule,
    | "id"
    | "enabled"
    | "priority"
    | "created_at"
    | "time_mode"
    | "days_of_week"
    | "time_from"
    | "time_to"
    | "start_at"
    | "end_at"
    | "applyToAll"
    | "activityIds"
    | "groupIds"
    | "on_air_since"
    | "overlap_mode"
    | "slots"
    | "overlapByActivity"
    | "overlapByGroup"
> & {
    rule_type: JudgeRuleType;
    /** Menù: il catalogo (senza non vince); `style_id` dove c'è. */
    layout: { catalog_id: string | null; style_id?: string | null } | null;
};

export type ViewJudgeRule<R> = JudgeRule & { source: R };

/** Gli strati delle viste: il menù (regole `layout` e `menu`), lo stile, e i tre che si sommano. */
export type ViewLayer = "layout" | "style" | "price" | "visibility" | "featured";

export const VIEW_LAYERS: readonly ViewLayer[] = ["layout", "style", "price", "visibility", "featured"];

export type ViewLayerOutcome<R> = {
    /** In onda: i menù che si vedono, lo stile, o tutte quelle che si sommano, in ordine di precedenza. */
    shown: JudgeEntry<ViewJudgeRule<R>>[];
    /** Attive ma coperte, con chi le copre. Vuoto negli strati che si sommano. */
    covered: Array<{ entry: JudgeEntry<ViewJudgeRule<R>>; by: JudgeEntry<ViewJudgeRule<R>> }>;
};

export type ViewOutcome<R> = Record<ViewLayer, ViewLayerOutcome<R>>;

/** Lo strato della vista in cui finisce una regola di questo tipo. */
export function viewLayerOf(ruleType: JudgeRuleType): ViewLayer {
    return ruleType === "menu" ? "layout" : ruleType;
}

function toMinutes(hhmm: string): number | null {
    const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
}

/**
 * Le fasce dalle colonne di oggi, come il ponte del database
 * (`schedule_slots_from_legacy`, mig 20261014090000): «Sempre» senza fasce,
 * «Fascia» senza ore tutto il giorno nei giorni scelti, fine 23:59 = 1440,
 * fine non dopo l'inizio = mai.
 */
export function slotsFromColumns(
    rule: Pick<JudgeViewRule, "id" | "time_mode" | "days_of_week" | "time_from" | "time_to">
): JudgeSlot[] {
    if (rule.time_mode !== "window") return [];
    const slot = (days: number[] | null, start: number, end: number): JudgeSlot[] => [
        { id: `${rule.id}:0`, days_of_week: days, start_minute: start, end_minute: end, activityIds: [], groupIds: [] }
    ];
    if (!rule.time_from || !rule.time_to) {
        return rule.days_of_week === null ? [] : slot(rule.days_of_week, 0, 1440);
    }
    const from = toMinutes(rule.time_from);
    let to = toMinutes(rule.time_to);
    if (from === null || to === null) return slot([], 0, 1440);
    if (to === 1439 && from < 1439) to = 1440;
    if (to <= from) return slot([], 0, 1440);
    return slot(rule.days_of_week, from, to);
}

/** La regola nella forma del giudice; le fasce caricate, o quelle del ponte. */
export function toJudgeRule<R extends JudgeViewRule>(rule: R): ViewJudgeRule<R> {
    const hasCatalog = (rule.layout?.catalog_id ?? null) !== null;
    const styleId = rule.layout?.style_id;
    return {
        id: rule.id,
        rule_type: rule.rule_type,
        enabled: rule.enabled,
        priority: rule.priority,
        created_at: rule.created_at,
        on_air_since: rule.on_air_since ?? rule.created_at,
        time_mode: rule.time_mode,
        start_at: rule.start_at,
        end_at: rule.end_at,
        applyToAll: rule.applyToAll,
        activityIds: rule.activityIds,
        groupIds: rule.groupIds,
        slots: rule.slots ?? slotsFromColumns(rule),
        overlap_mode: rule.overlap_mode ?? null,
        overlapByActivity: rule.overlapByActivity,
        overlapByGroup: rule.overlapByGroup,
        ...(rule.rule_type === "layout" || rule.rule_type === "menu" ? { hasMenu: hasCatalog } : {}),
        ...((rule.rule_type === "layout" || rule.rule_type === "style") && styleId !== undefined
            ? { hasStyle: styleId !== null }
            : {}),
        // Le layout si ordinano ancora come oggi (D83), coi punti delle colonne.
        ...(rule.rule_type === "layout" ? { todayTemporalScore: temporalScore(rule) } : {}),
        source: rule
    };
}

/** «Adesso» dell'elenco: in periodo e in una delle sue fasce, in una sede qualunque. */
export function isViewRuleActiveNow(rule: JudgeViewRule, now: RomeDateTime): boolean {
    return rule.enabled && isJudgeRuleActiveAnywhereAt(toJudgeRule(rule), now);
}

/** Il verdetto per una sede, strato per strato. */
export function judgeSeat<R>(
    rules: readonly ViewJudgeRule<R>[],
    seat: CompetitionSeat,
    now: RomeDateTime
): ViewOutcome<R> {
    const verdict = judge(rules, seat, now);
    // Un menù è coperto solo da un «al posto degli altri».
    const menuBy = verdict.menuCover;
    const styleBy = verdict.style;
    return {
        layout: {
            shown: verdict.menus,
            covered: menuBy ? verdict.coveredMenus.map(entry => ({ entry, by: menuBy })) : []
        },
        style: {
            shown: styleBy ? [styleBy] : [],
            covered: styleBy ? verdict.coveredStyles.map(entry => ({ entry, by: styleBy })) : []
        },
        price: { shown: verdict.price, covered: [] },
        visibility: { shown: verdict.visibility, covered: [] },
        featured: { shown: verdict.featured, covered: [] }
    };
}
