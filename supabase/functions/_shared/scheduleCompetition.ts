// Chi vince, per sede e per strato: la competizione fra regole di
// Programmazione in un posto solo, pura (nessuna query, nessun I/O).
//
// UN SOLO FILE, non una coppia ⚠️ SYNC: l'Edge lo importa come
// `./scheduleCompetition.ts`, il frontend come `@shared/scheduleCompetition`
// (alias su supabase/functions/_shared). Per restare importabile da entrambi
// il file non importa niente: niente API Deno, niente import con suffisso .ts.
//
// Contratto (lo stesso di scheduleResolver.ts, che delega qui la scelta):
// 1. specificità del target: sede (2) > gruppo di sedi (1) > tutte (0);
//    apply_to_all vale 0 anche se la regola ha target residui;
// 2. specificità temporale: più vincoli, più specifica (periodo 4,
//    fascia oraria 2, giorni 1);
// 3. priority ASC, poi created_at ASC, poi id ASC.
// Una regola disabilitata non è candidata. Una regola layout senza catalogo
// (hasPayload=false) è candidata ma non vince né perde: passa la successiva.

/**
 * Istante espresso nell'ora di Roma. Stessa forma di `RomeDateTime` in
 * schedulingNow.ts (frontend ed Edge), ridichiarata per non importare.
 */
export type RomeDateTime = {
    /** Epoch UTC vero: per i confronti con start_at/end_at. */
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

export type CompetitionRuleType = "layout" | "price" | "visibility" | "featured";
export type CompetitionSpecificity = 0 | 1 | 2;

export const COMPETITION_RULE_TYPES: readonly CompetitionRuleType[] = [
    "layout",
    "price",
    "visibility",
    "featured"
];

export type CompetitionTimeWindow = {
    time_mode: "always" | "window";
    days_of_week: number[] | null;
    time_from: string | null;
    time_to: string | null;
    start_at: string | null;
    end_at: string | null;
};

export type CompetitionRule = CompetitionTimeWindow & {
    id: string;
    rule_type: CompetitionRuleType;
    enabled: boolean;
    priority: number;
    created_at: string;
    applyToAll: boolean;
    activityIds: readonly string[];
    groupIds: readonly string[];
    /** Solo layout: false se la regola non ha un catalogo. Assente = true. */
    hasPayload?: boolean;
};

/** La sede su cui si gioca la competizione, coi gruppi di cui fa parte. */
export type CompetitionSeat = {
    activityId: string;
    groupIds: readonly string[];
};

export type RankedRule<R extends CompetitionRule = CompetitionRule> = {
    rule: R;
    specificity: CompetitionSpecificity;
};

export type LayerOutcome<R extends CompetitionRule = CompetitionRule> = {
    /** La regola che decide adesso, o null. */
    winner: RankedRule<R> | null;
    /** In finestra adesso e perdenti, nell'ordine della competizione. */
    contenders: RankedRule<R>[];
    /** Tutte le regole abilitate che raggiungono la sede, a qualunque ora, in ordine. */
    candidates: RankedRule<R>[];
};

export type CompetitionOutcome<R extends CompetitionRule = CompetitionRule> = Record<
    CompetitionRuleType,
    LayerOutcome<R>
>;

function toMinutes(hhmm: string | null): number | null {
    if (!hhmm) return null;
    const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
}

/**
 * La finestra della regola contiene `now`? Tutto all'ora di Roma.
 * - periodo: inizio incluso, fine esclusa; una finestra con inizio e senza
 *   fine è esclusa (una regola vecchia non vince per sempre col punteggio);
 * - «Sempre» ignora giorni e orari;
 * - giorni: null = ogni giorno, [] = mai;
 * - orari: da incluso, a escluso.
 */
export function isTimeRuleActiveNow(rule: CompetitionTimeWindow, now: RomeDateTime): boolean {
    if (rule.start_at || rule.end_at) {
        if (rule.start_at && now.epoch < new Date(rule.start_at).getTime()) return false;
        if (rule.end_at && now.epoch >= new Date(rule.end_at).getTime()) return false;
        if (rule.time_mode === "window" && rule.start_at && !rule.end_at) return false;
    }

    if (rule.time_mode === "always") return true;

    if (rule.days_of_week !== null && !rule.days_of_week.includes(now.dayOfWeek)) {
        return false;
    }

    if (!rule.time_from || !rule.time_to) return true;

    const from = toMinutes(rule.time_from);
    const to = toMinutes(rule.time_to);
    if (from === null || to === null) return false;

    const nowMinutes = now.hour * 60 + now.minute;
    return from <= nowMinutes && nowMinutes < to;
}

/** Più vincoli temporali = più specifica. */
export function temporalScore(rule: CompetitionTimeWindow): number {
    let score = 0;
    if (rule.start_at || rule.end_at) score += 4;
    if (rule.time_from && rule.time_to) score += 2;
    if (rule.days_of_week && rule.days_of_week.length > 0) score += 1;
    return score;
}

/** Quanto la regola è specifica per questa sede; null se non la raggiunge. */
export function specificityFor(
    rule: Pick<CompetitionRule, "applyToAll" | "activityIds" | "groupIds">,
    seat: CompetitionSeat
): CompetitionSpecificity | null {
    if (rule.applyToAll) return 0;
    if (rule.activityIds.includes(seat.activityId)) return 2;
    if (rule.groupIds.some(groupId => seat.groupIds.includes(groupId))) return 1;
    return null;
}

/** Ordine della competizione: il primo vince. */
export function compareCandidates(a: RankedRule, b: RankedRule): number {
    if (a.specificity !== b.specificity) return b.specificity - a.specificity;
    const temporalDelta = temporalScore(b.rule) - temporalScore(a.rule);
    if (temporalDelta !== 0) return temporalDelta;
    if (a.rule.priority !== b.rule.priority) return a.rule.priority - b.rule.priority;
    const createdDelta = new Date(a.rule.created_at).getTime() - new Date(b.rule.created_at).getTime();
    if (createdDelta !== 0) return createdDelta;
    return a.rule.id.localeCompare(b.rule.id);
}

/**
 * Per ogni strato, chi vince su questa sede in questo istante, chi perde
 * stando in finestra, e quante regole sono configurate per la sede.
 */
export function resolveCompetition<R extends CompetitionRule>(
    rules: readonly R[],
    seat: CompetitionSeat,
    now: RomeDateTime
): CompetitionOutcome<R> {
    const outcome = {} as CompetitionOutcome<R>;

    for (const type of COMPETITION_RULE_TYPES) {
        const candidates: RankedRule<R>[] = [];
        for (const rule of rules) {
            if (rule.rule_type !== type || !rule.enabled) continue;
            const specificity = specificityFor(rule, seat);
            if (specificity !== null) candidates.push({ rule, specificity });
        }
        candidates.sort(compareCandidates);

        const inPlay = candidates.filter(
            entry => entry.rule.hasPayload !== false && isTimeRuleActiveNow(entry.rule, now)
        );

        outcome[type] = {
            winner: inPlay[0] ?? null,
            contenders: inPlay.slice(1),
            candidates
        };
    }

    return outcome;
}
