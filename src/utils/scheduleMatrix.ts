import type { LayoutRule, LayoutRuleOption } from "@/services/supabase/layoutScheduling";
import { toCompetitionRule } from "@/utils/ruleInsights";
import { describeRuleAction } from "@/utils/ruleHelpers";
import { isLayoutRuleDraft } from "@/utils/scheduleDraft";
import { deriveScheduleStatus } from "@/utils/scheduleStatus";
import {
    isTimeRuleActiveNow,
    resolveCompetition,
    specificityFor,
    type CompetitionRuleType,
    type CompetitionSeat,
    type RomeDateTime
} from "@shared/scheduleCompetition";

/**
 * La matrice sedi × strati di Programmazione (§20.3, §50.7): per ogni sede,
 * strato per strato, la regola che vince nell'istante del cursore — la
 * stessa `resolveCompetition` della pagina pubblica e di «Sovrascritta da» —
 * e, dove non vince nessuna, perché. Più il riepilogo della banda.
 * Pura: nessuna richiesta, lavora sulle regole già caricate dalla pagina.
 */

/** Le colonne della matrice, nell'ordine in cui si applicano (§20.6). */
export const MATRIX_LAYERS: readonly CompetitionRuleType[] = ["layout", "visibility", "price", "featured"];

/**
 * Perché una cella è vuota. Conta la categoria che vince, in quest'ordine:
 * bozza (si sistema), fuori fascia, disabilitata, scaduta, nessuna regola.
 */
export type MatrixDiagnosis = {
    kind: "draft" | "outOfWindow" | "disabled" | "expired" | "none";
    count: number;
};

export type MatrixCell<R> = { kind: "winner"; rule: R } | { kind: "empty"; diagnosis: MatrixDiagnosis };

export type MatrixRow<R> = {
    activityId: string;
    name: string;
    suspended: boolean;
    cells: Record<CompetitionRuleType, MatrixCell<R>>;
    /** Modifiche a mano della sede; null se il conteggio non c'è. */
    manualCount: number | null;
};

export type BandSummary = {
    /** Le sedi della matrice, sospese comprese. */
    total: number;
    /** Sedi pubblicate con un menù che vince, se l'abbonamento è attivo. */
    showing: number;
    /** Sedi pubblicate con almeno una modifica a mano. */
    withManual: number;
    subscriptionInactive: boolean;
};

export type ScheduleMatrix<R> = { rows: MatrixRow<R>[]; band: BandSummary };

export type ScheduleMatrixInput<R extends LayoutRule> = {
    rules: readonly R[];
    activities: ReadonlyArray<Pick<LayoutRuleOption, "id" | "name" | "status">>;
    activityIdsByGroupId: Record<string, string[]>;
    manualCounts: Record<string, number> | null;
    /** La sede del filtro della navbar: la matrice ha una riga sola. */
    filterActivityId: string | null;
    instant: RomeDateTime;
    subscriptionInactive: boolean;
};

const DIAGNOSIS_ORDER: ReadonlyArray<MatrixDiagnosis["kind"]> = ["draft", "outOfWindow", "disabled", "expired"];

function diagnose<R extends LayoutRule>(rules: readonly R[], seat: CompetitionSeat, instant: RomeDateTime): MatrixDiagnosis {
    const counts: Record<MatrixDiagnosis["kind"], number> = { draft: 0, outOfWindow: 0, disabled: 0, expired: 0, none: 0 };
    const now = new Date(instant.epoch);
    for (const rule of rules) {
        if (specificityFor(rule, seat) === null) continue;
        if (isLayoutRuleDraft(rule)) {
            counts.draft += 1;
            continue;
        }
        const status = deriveScheduleStatus({
            enabled: rule.enabled,
            endAt: rule.end_at,
            isConfigDraft: false,
            isZeroReach: false,
            isActiveNow: rule.enabled && isTimeRuleActiveNow(rule, instant),
            now
        });
        if (status === "scheduled") counts.outOfWindow += 1;
        else if (status === "disabled") counts.disabled += 1;
        else if (status === "expired") counts.expired += 1;
    }
    const kind = DIAGNOSIS_ORDER.find(k => counts[k] > 0);
    return kind ? { kind, count: counts[kind] } : { kind: "none", count: 0 };
}

export function buildScheduleMatrix<R extends LayoutRule>(input: ScheduleMatrixInput<R>): ScheduleMatrix<R> {
    const { rules, activities, activityIdsByGroupId, manualCounts, filterActivityId, instant, subscriptionInactive } = input;

    const groupIdsByActivityId = new Map<string, string[]>();
    for (const [groupId, memberIds] of Object.entries(activityIdsByGroupId)) {
        for (const activityId of memberIds) {
            groupIdsByActivityId.set(activityId, [...(groupIdsByActivityId.get(activityId) ?? []), groupId]);
        }
    }

    const competitionRules = rules.map(toCompetitionRule);
    const rulesByType = new Map<CompetitionRuleType, R[]>(MATRIX_LAYERS.map(type => [type, rules.filter(r => r.rule_type === type)]));
    const seats = filterActivityId ? activities.filter(activity => activity.id === filterActivityId) : activities;

    const rows = seats.map(activity => {
        const seat: CompetitionSeat = { activityId: activity.id, groupIds: groupIdsByActivityId.get(activity.id) ?? [] };
        const outcome = resolveCompetition(competitionRules, seat, instant);
        const cells = {} as Record<CompetitionRuleType, MatrixCell<R>>;
        for (const type of MATRIX_LAYERS) {
            const winner = outcome[type].winner;
            cells[type] = winner
                ? { kind: "winner", rule: winner.rule.source }
                : { kind: "empty", diagnosis: diagnose(rulesByType.get(type) ?? [], seat, instant) };
        }
        return {
            activityId: activity.id,
            name: activity.name,
            suspended: activity.status === "inactive",
            cells,
            manualCount: manualCounts ? (manualCounts[activity.id] ?? 0) : null
        };
    });

    const published = rows.filter(row => !row.suspended);
    return {
        rows,
        band: {
            total: rows.length,
            showing: subscriptionInactive ? 0 : published.filter(row => row.cells.layout.kind === "winner").length,
            withManual: published.filter(row => (row.manualCount ?? 0) > 0).length,
            subscriptionInactive
        }
    };
}

const MANUAL_LINE = "modifiche a mano in corso, che vincono sulle regole.";

/** L'esito della banda e la riga delle modifiche a mano (null se non ce ne sono). */
export function describeBand<R extends LayoutRule>(
    matrix: ScheduleMatrix<R>,
    catalogName: (catalogId: string) => string | undefined
): { headline: string; manual: string | null } {
    const { rows, band } = matrix;
    if (band.subscriptionInactive) {
        return { headline: "Nessuna sede mostra un menù: l'abbonamento non è attivo.", manual: null };
    }

    if (rows.length === 1) {
        const [row] = rows;
        const manual = !row.suspended && (row.manualCount ?? 0) > 0 ? `Ha ${MANUAL_LINE}` : null;
        if (row.suspended) return { headline: `${row.name} è sospesa: non mostra un menù`, manual };
        const layout = row.cells.layout;
        const catalogId = layout.kind === "winner" ? layout.rule.layout?.catalog_id : null;
        const name = catalogId ? catalogName(catalogId) : undefined;
        return {
            headline: layout.kind === "winner" ? `${row.name} sta mostrando ${name ?? "un menù"}` : `${row.name} non sta mostrando un menù`,
            manual
        };
    }

    const headline =
        band.showing === 0
            ? `Nessuna sede su ${band.total} sta mostrando un menù`
            : band.showing === 1
              ? `1 sede su ${band.total} sta mostrando un menù`
              : `${band.showing} sedi su ${band.total} stanno mostrando un menù`;
    const manual =
        band.withManual === 0 ? null : band.withManual === 1 ? `1 ha ${MANUAL_LINE}` : `${band.withManual} hanno ${MANUAL_LINE}`;
    return { headline, manual };
}

/** Perché la cella è vuota. «adesso» solo quando il cursore è sull'ora di adesso. */
export function describeDiagnosis(diagnosis: MatrixDiagnosis, atNow: boolean): string {
    const { kind, count } = diagnosis;
    const one = count === 1;
    switch (kind) {
        case "draft":
            return one ? "1 bozza, non attiva" : `${count} bozze, non attive`;
        case "outOfWindow":
            return `${count} ${one ? "regola" : "regole"}, fuori fascia ${atNow ? "adesso" : "a quest'ora"}`;
        case "disabled":
            return one ? "1 regola disabilitata" : `${count} regole disabilitate`;
        case "expired":
            return one ? "1 regola scaduta" : `${count} regole scadute`;
        default:
            return "nessuna regola";
    }
}

/** La cella «A mano»: quante modifiche, o perché non c'è niente. */
export function describeManual(count: number | null): { primary: string | null; secondary: string } {
    if (count === null) return { primary: null, secondary: "non caricate" };
    if (count === 0) return { primary: null, secondary: "nessuna" };
    return count === 1
        ? { primary: "1 modifica", secondary: "ha l'ultima parola" }
        : { primary: `${count} modifiche`, secondary: "hanno l'ultima parola" };
}

/**
 * La cella che vince: per il menù il catalogo sopra e la regola sotto; per gli
 * altri strati la regola sopra e cosa fa sotto (in evidenza: i contenuti).
 */
export function describeWinner(rule: LayoutRule, catalogName?: string): { primary: string; secondary: string | null } {
    const name = rule.name?.trim() || "Regola senza nome";
    if (rule.rule_type === "layout") return { primary: catalogName ?? name, secondary: catalogName ? name : null };
    if (rule.rule_type === "featured") {
        const titles = rule.featured_contents.map(content => content.featured_content_title).filter(Boolean);
        if (titles.length > 0) return { primary: name, secondary: titles.join(" · ") };
    }
    return { primary: name, secondary: describeRuleAction(rule) };
}
