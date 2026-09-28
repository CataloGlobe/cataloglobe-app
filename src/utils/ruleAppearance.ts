import type { LayoutRule, LayoutRuleFeaturedContent } from "@/services/supabase/layoutScheduling";
import { buildRuleSummary } from "@/utils/ruleHelpers";
import { toCompetitionRule } from "@/utils/ruleInsights";
import { isLayoutRuleDraft } from "@/utils/scheduleDraft";
import { ruleReachesAnyActivity } from "@/utils/scheduleReach";
import { deriveScheduleStatus, type ScheduleStatus } from "@/utils/scheduleStatus";
import {
    isTimeRuleActiveNow,
    resolveCompetition,
    specificityFor,
    type CompetitionOutcome,
    type CompetitionRule,
    type CompetitionSeat,
    type RomeDateTime
} from "@shared/scheduleCompetition";

/**
 * Dove e quando appare una cosa (§50.13): un menù, uno stile, un contenuto in
 * evidenza — e, senza regole, una storia. Una sola fonte per le quattro
 * pagine, e la stessa competizione della pagina pubblica, della matrice e di
 * «Sovrascritta da»: `resolveCompetition` una volta per sede, poi per ogni
 * regola che nomina l'oggetto il motivo per cui, in quella sede, è in onda o
 * no. Pura: lavora sulle regole caricate da `listAppearanceSources`.
 *
 * Cosa vuol dire «in onda» (verificato su `resolve-public-catalog`, §50.13):
 * - un menù e il suo stile, dove vince la regola layout che li nomina;
 * - un contenuto in evidenza, dove vince la regola featured che lo nomina,
 *   anche senza un menù (la pagina pubblica resta `ready` col solo featured);
 * - sempre a sede pubblicata e abbonamento attivo.
 */

export type AppearanceSubject = { kind: "catalog" | "style" | "featured"; id: string };

/**
 * Perché, in una sede, l'oggetto è in onda o no. Stesso vocabolario delle
 * celle della matrice (`scheduleMatrix.ts`), più chi perde la competizione.
 */
export type SeatReason =
    | "live"
    | "overridden"
    | "outOfWindow"
    | "suspended"
    | "subscriptionInactive"
    | "draft"
    | "disabled"
    | "expired";

/** Dal migliore al peggiore: in una sede con più regole vale la prima. */
const REASON_ORDER: readonly SeatReason[] = [
    "live",
    "overridden",
    "outOfWindow",
    "suspended",
    "subscriptionInactive",
    "draft",
    "disabled",
    "expired"
];

export type AppearanceSeat = {
    activityId: string;
    name: string;
    reason: SeatReason;
    /** La regola che dà il motivo. */
    rule: LayoutRule;
    /** Chi vince al posto suo, per `overridden`. */
    overriddenBy: LayoutRule | null;
};

export type AppearanceRuleEntry = {
    rule: LayoutRule;
    /** Lo stato della regola, come in Programmazione. */
    status: ScheduleStatus;
    /** Viva (§28.2, `live()`): accesa, completa, con portata, non scaduta. */
    isLive: boolean;
    /** Solo in evidenza: sopra o sotto il menù. */
    slot: LayoutRuleFeaturedContent["slot"] | null;
    /** Le sedi che la regola raggiunge, nell'ordine delle sedi. */
    activityIds: string[];
};

/**
 * - `liveNow`: in onda adesso in almeno una sede;
 * - `assigned`: una regola viva lo porta, ma adesso non è in onda da nessuna parte;
 * - `stoppedOnly`: lo nominano solo regole ferme (spente, bozze, scadute);
 * - `unassigned`: nessuna regola lo nomina.
 */
export type AppearanceSummary = "liveNow" | "assigned" | "stoppedOnly" | "unassigned";

export type Appearance = {
    summary: AppearanceSummary;
    /** Una riga per sede raggiunta, col motivo migliore, nell'ordine delle sedi. */
    seats: AppearanceSeat[];
    /** Le regole che lo nominano, nell'ordine della competizione. */
    rules: AppearanceRuleEntry[];
};

export type AppearanceActivity = { id: string; name: string; status: "active" | "inactive" | string };

export type AppearanceInput = {
    /** Le regole dell'azienda (servono tutte quelle dei tipi che competono). */
    rules: readonly LayoutRule[];
    activities: readonly AppearanceActivity[];
    activityIdsByGroupId: Record<string, string[]>;
    instant: RomeDateTime;
    subscriptionInactive: boolean;
};

type Seat = CompetitionSeat & { name: string; suspended: boolean };

export type AppearanceIndex = {
    seats: Seat[];
    outcomes: Map<string, CompetitionOutcome<CompetitionRule & { source: LayoutRule }>>;
    entries: Map<string, AppearanceRuleEntry>;
    rules: readonly LayoutRule[];
    instant: RomeDateTime;
    subscriptionInactive: boolean;
};

/** Una competizione per sede, una volta sola per pagina. */
export function buildAppearance(input: AppearanceInput): AppearanceIndex {
    const { rules, activities, activityIdsByGroupId, instant, subscriptionInactive } = input;

    const groupIdsByActivityId = new Map<string, string[]>();
    for (const [groupId, memberIds] of Object.entries(activityIdsByGroupId)) {
        for (const activityId of memberIds) {
            groupIdsByActivityId.set(activityId, [...(groupIdsByActivityId.get(activityId) ?? []), groupId]);
        }
    }
    const seats: Seat[] = activities.map(activity => ({
        activityId: activity.id,
        groupIds: groupIdsByActivityId.get(activity.id) ?? [],
        name: activity.name,
        suspended: activity.status !== "active"
    }));

    const competitionRules = rules.map(toCompetitionRule);
    const outcomes = new Map(seats.map(seat => [seat.activityId, resolveCompetition(competitionRules, seat, instant)]));

    const activityIds = new Set(activities.map(activity => activity.id));
    const reachCtx = {
        activityExists: (id: string) => activityIds.has(id),
        groupMemberCount: (id: string) => (activityIdsByGroupId[id] ?? []).length
    };
    const now = new Date(instant.epoch);
    const entries = new Map<string, AppearanceRuleEntry>();
    for (const rule of rules) {
        const isDraft = isLayoutRuleDraft(rule);
        const isZeroReach = !ruleReachesAnyActivity(rule, reachCtx);
        const status = deriveScheduleStatus({
            enabled: rule.enabled,
            endAt: rule.end_at,
            isConfigDraft: isDraft,
            isZeroReach,
            isActiveNow: rule.enabled && isTimeRuleActiveNow(rule, instant),
            now
        });
        entries.set(rule.id, {
            rule,
            status,
            isLive: rule.enabled && !isDraft && !isZeroReach && status !== "expired",
            slot: null,
            activityIds: seats.filter(seat => specificityFor(rule, seat) !== null).map(seat => seat.activityId)
        });
    }

    return { seats, outcomes, entries, rules, instant, subscriptionInactive };
}

function namesSubject(rule: LayoutRule, subject: AppearanceSubject): boolean {
    switch (subject.kind) {
        case "catalog":
            return rule.rule_type === "layout" && rule.layout?.catalog_id === subject.id;
        case "style":
            return rule.rule_type === "layout" && rule.layout?.style_id === subject.id;
        case "featured":
            return rule.rule_type === "featured" && rule.featured_contents.some(fc => fc.featured_content_id === subject.id);
    }
}

/**
 * Il motivo di una regola in una sede che raggiunge. Chi vince e chi perde li
 * dice la competizione; per le altre vale l'ordine della diagnosi della
 * matrice (bozza, fuori fascia, disabilitata, scaduta). Poi la sede e
 * l'abbonamento: una regola che andrebbe in onda non va in onda in una sede
 * sospesa, né con l'abbonamento fermo.
 */
function seatReason(index: AppearanceIndex, seat: Seat, rule: LayoutRule): { reason: SeatReason; overriddenBy: LayoutRule | null } {
    const layer = index.outcomes.get(seat.activityId)?.[rule.rule_type];
    let reason: SeatReason;
    let overriddenBy: LayoutRule | null = null;
    if (layer?.winner?.rule.id === rule.id) {
        reason = "live";
    } else if (layer?.contenders.some(entry => entry.rule.id === rule.id)) {
        reason = "overridden";
        overriddenBy = layer.winner?.rule.source ?? null;
    } else if (isLayoutRuleDraft(rule)) {
        reason = "draft";
    } else if (!rule.enabled) {
        reason = "disabled";
    } else if (rule.end_at && new Date(rule.end_at).getTime() <= index.instant.epoch) {
        reason = "expired";
    } else {
        reason = "outOfWindow";
    }

    if (reason === "live" || reason === "overridden" || reason === "outOfWindow") {
        if (seat.suspended) return { reason: "suspended", overriddenBy: null };
        if (index.subscriptionInactive) return { reason: "subscriptionInactive", overriddenBy: null };
    }
    return { reason, overriddenBy };
}

export function appearanceOf(index: AppearanceIndex, subject: AppearanceSubject): Appearance {
    const named = index.rules.filter(rule => namesSubject(rule, subject));
    // L'ordine della competizione, come l'elenco di Programmazione dentro un livello.
    const ordered = [...named].sort((a, b) => {
        const ea = index.entries.get(a.id)!;
        const eb = index.entries.get(b.id)!;
        if (ea.isLive !== eb.isLive) return ea.isLive ? -1 : 1;
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.created_at.localeCompare(b.created_at);
    });

    const rules = ordered.map(rule => {
        const entry = index.entries.get(rule.id)!;
        const slot =
            subject.kind === "featured"
                ? (rule.featured_contents.find(fc => fc.featured_content_id === subject.id)?.slot ?? null)
                : null;
        return { ...entry, slot };
    });

    const seats: AppearanceSeat[] = [];
    for (const seat of index.seats) {
        let best: AppearanceSeat | null = null;
        for (const rule of ordered) {
            if (specificityFor(rule, seat) === null) continue;
            const { reason, overriddenBy } = seatReason(index, seat, rule);
            if (!best || REASON_ORDER.indexOf(reason) < REASON_ORDER.indexOf(best.reason)) {
                best = { activityId: seat.activityId, name: seat.name, reason, rule, overriddenBy };
            }
        }
        if (best) seats.push(best);
    }

    const summary: AppearanceSummary = seats.some(seat => seat.reason === "live")
        ? "liveNow"
        : rules.some(entry => entry.isLive)
          ? "assigned"
          : rules.length > 0
            ? "stoppedOnly"
            : "unassigned";

    return { summary, seats, rules };
}

/** Le sedi dove è in onda adesso. */
export function liveSeats(appearance: Appearance): AppearanceSeat[] {
    return appearance.seats.filter(seat => seat.reason === "live");
}

/**
 * Lo stile con cui un menù va in onda (§50.13/1): quello della regola che
 * vince adesso; se il menù non è in onda, quello delle regole vive che lo
 * portano. Più stili: tutti, nell'ordine, il primo è quello da mostrare.
 */
export function catalogStyleIds(appearance: Appearance): string[] {
    const fromLive = liveSeats(appearance).map(seat => seat.rule.layout?.style_id ?? null);
    const fromRules = appearance.rules.filter(entry => entry.isLive).map(entry => entry.rule.layout?.style_id ?? null);
    const source = fromLive.length > 0 ? fromLive : fromRules;
    return Array.from(new Set(source.filter((id): id is string => Boolean(id))));
}

// ---------------------------------------------------------------------------
// Storie: nessuna regola. La storia non passa da Programmazione: la decidono
// lo stato, la sede scelta, la sede pubblicata e l'abbonamento — i cancelli di
// `resolve-public-story`. Stessa domanda, senza competizione.
// ---------------------------------------------------------------------------

export type StoryAppearance =
    | { kind: "everywhere"; seats: AppearanceActivity[] }
    | { kind: "oneSede"; seat: AppearanceActivity }
    | { kind: "nowhere"; reason: "draft" | "suspended" | "subscriptionInactive" | "missingSede" | "noPublishedSede"; seatName?: string };

export function storyAppearance(
    story: { status: "draft" | "published" | string; activity_id: string | null },
    activities: readonly AppearanceActivity[],
    subscriptionInactive: boolean
): StoryAppearance {
    if (story.status !== "published") return { kind: "nowhere", reason: "draft" };
    if (story.activity_id) {
        const seat = activities.find(activity => activity.id === story.activity_id);
        if (!seat) return { kind: "nowhere", reason: "missingSede" };
        if (seat.status !== "active") return { kind: "nowhere", reason: "suspended", seatName: seat.name };
        if (subscriptionInactive) return { kind: "nowhere", reason: "subscriptionInactive" };
        return { kind: "oneSede", seat };
    }
    if (subscriptionInactive) return { kind: "nowhere", reason: "subscriptionInactive" };
    const published = activities.filter(activity => activity.status === "active");
    if (published.length === 0) return { kind: "nowhere", reason: "noPublishedSede" };
    return { kind: "everywhere", seats: published };
}

// ---------------------------------------------------------------------------
// Parole. Tutte le pagine le leggono da qui: lo stesso fatto, la stessa frase.
// ---------------------------------------------------------------------------

const REASON_LABEL: Record<SeatReason, string> = {
    live: "in onda adesso",
    overridden: "vince un'altra regola",
    outOfWindow: "non in finestra adesso",
    suspended: "sede sospesa",
    subscriptionInactive: "abbonamento non attivo",
    draft: "la regola è una bozza",
    disabled: "la regola è spenta",
    expired: "la regola è scaduta"
};

export function describeSeatReason(seat: AppearanceSeat): string {
    if (seat.reason === "overridden" && seat.overriddenBy) {
        return `vince «${seat.overriddenBy.name?.trim() || "Regola senza nome"}»`;
    }
    return REASON_LABEL[seat.reason];
}

export type SummaryTone = "success" | "warning" | "neutral";

/** La riga d'uso di un menù (§23.2) e i suoi tre toni: accento, ambra, neutro. */
export function describeCatalogSummary(appearance: Appearance): { label: string; tone: SummaryTone } {
    const live = liveSeats(appearance);
    switch (appearance.summary) {
        case "liveNow":
            // Più sedi: il numero; i nomi li dice la banda del dettaglio.
            return {
                label: live.length === 1 ? `Attivo adesso in ${live[0].name}` : `Attivo adesso in ${live.length} sedi`,
                tone: "success"
            };
        case "assigned": {
            const n = new Set(appearance.rules.filter(entry => entry.isLive).flatMap(entry => entry.activityIds)).size;
            return { label: n === 1 ? "Su 1 sede, non adesso" : `Su ${n} sedi, nessuna adesso`, tone: "warning" };
        }
        case "stoppedOnly":
            return { label: "Solo su regole ferme", tone: "neutral" };
        default:
            return { label: "Non assegnato a nessuna sede", tone: "neutral" };
    }
}

/** Lo stato d'uso di uno stile (§34.3): lo stato di effetto più alto. */
export function describeStyleSummary(appearance: Appearance): { label: string; tone: SummaryTone } {
    switch (appearance.summary) {
        case "liveNow":
            return { label: "Attivo adesso", tone: "success" };
        case "assigned":
            return { label: "Programmato", tone: "warning" };
        case "stoppedOnly":
            return { label: "Solo su regole ferme", tone: "neutral" };
        default:
            return { label: "Non utilizzato", tone: "neutral" };
    }
}

const SLOT_LABEL: Record<LayoutRuleFeaturedContent["slot"], string> = {
    before_catalog: "sopra il menù",
    after_catalog: "sotto il menù"
};

/** «tutte le sedi» · «Centro» · «3 sedi». */
export function describeReach(entry: AppearanceRuleEntry, activityName: (id: string) => string | undefined): string {
    if (entry.rule.applyToAll) return "tutte le sedi";
    if (entry.activityIds.length === 1) return activityName(entry.activityIds[0]) ?? "1 sede";
    if (entry.activityIds.length === 0) return "nessuna sede";
    return `${entry.activityIds.length} sedi`;
}

/** La finestra della regola: «sempre», «Lun–Ven · 11:00–15:00». Stessa resa di Programmazione. */
export function describeWhen(rule: LayoutRule): string {
    if (rule.time_mode === "always") return "sempre";
    return buildRuleSummary({
        time_mode: rule.time_mode,
        days_of_week: rule.days_of_week,
        time_from: rule.time_from,
        time_to: rule.time_to,
        start_at: rule.start_at,
        end_at: rule.end_at
    })
        .split(" · ")
        .filter(segment => segment !== "Scaduta")
        .join(" · ");
}

/** «sopra il menù · tutte le sedi · sempre» (§28.1). */
export function describePlacement(entry: AppearanceRuleEntry, activityName: (id: string) => string | undefined): string {
    return [entry.slot ? SLOT_LABEL[entry.slot] : null, describeReach(entry, activityName), describeWhen(entry.rule)]
        .filter(Boolean)
        .join(" · ");
}

const STOPPED_LABEL: Partial<Record<ScheduleStatus, string>> = {
    draft: "regola in bozza",
    disabled: "regola spenta",
    expired: "regola scaduta"
};

/** Perché una regola non mostra niente, se è ferma; null se è viva. */
export function describeStoppedRule(entry: AppearanceRuleEntry): string | null {
    if (entry.isLive) return null;
    return STOPPED_LABEL[entry.status] ?? "regola in bozza";
}

/** La riga «dove appare» di una storia. */
export function describeStoryAppearance(appearance: StoryAppearance): { label: string; muted: boolean } {
    switch (appearance.kind) {
        case "everywhere":
            return { label: "Tutte le sedi", muted: false };
        case "oneSede":
            return { label: `Solo ${appearance.seat.name}`, muted: false };
        default: {
            const why = {
                draft: "è una bozza",
                suspended: `${appearance.seatName ?? "la sede"} è sospesa`,
                subscriptionInactive: "abbonamento non attivo",
                missingSede: "la sede non c'è più",
                noPublishedSede: "nessuna sede pubblicata"
            }[appearance.reason];
            return { label: `Da nessuna parte: ${why}`, muted: true };
        }
    }
}

const NAMES_FORMAT = new Intl.ListFormat("it", { style: "long", type: "conjunction" });

/** «Centro e Porto», «Centro, Porto e Lago»; oltre quattro, «… e altre N sedi». */
export function joinSeatNames(names: readonly string[], max = 4): string {
    if (names.length <= max) return NAMES_FORMAT.format(names);
    const rest = names.length - max + 1;
    return NAMES_FORMAT.format([...names.slice(0, max - 1), `altre ${rest} sedi`]);
}

const BACK = "Se serve, da Versioni torni alla versione di prima.";

/**
 * L'avviso prima di salvare uno stile (§34.5/1–2): chi vede la modifica, e
 * quando. Null se nessuna regola viva lo porta: allora l'avviso non si apre.
 */
export function describeStyleSaveWarning(appearance: Appearance): string | null {
    if (appearance.summary === "liveNow") {
        const names = liveSeats(appearance).map(seat => seat.name);
        return `${joinSeatNames(names)} ${names.length === 1 ? "vede" : "vedono"} le modifiche subito. ${BACK}`;
    }
    if (appearance.summary === "assigned") {
        const waiting = appearance.seats
            .filter(seat => seat.reason === "outOfWindow" || seat.reason === "overridden" || seat.reason === "subscriptionInactive")
            .map(seat => seat.name);
        const where = waiting.length > 0 ? `, su ${joinSeatNames(waiting)}` : "";
        return `Nessuna sede lo mostra adesso: le modifiche arrivano con le sue regole programmate${where}. ${BACK}`;
    }
    return null;
}

/**
 * La riga «dove e quando» di un contenuto in evidenza (§28.1–2): la prima
 * regola che lo nomina (viva, se ce n'è una), se è ferma, e l'avviso quando
 * nessun cliente lo vede. «Nessuna regola li mostra» conta le regole vive,
 * non quelle che esistono: collegato non vuol dire attivo.
 */
export function describeFeaturedLine(
    appearance: Appearance,
    activityName: (id: string) => string | undefined
): { placement: string | null; stopped: string | null; more: number; warning: string | null } {
    const [first, ...rest] = appearance.rules;
    return {
        placement: first ? describePlacement(first, activityName) : null,
        stopped: first ? describeStoppedRule(first) : null,
        more: rest.length,
        warning:
            appearance.summary === "unassigned"
                ? "nessuna regola lo mostra: nessun cliente lo vede"
                : appearance.summary === "stoppedOnly"
                  ? "nessuna regola viva lo mostra: nessun cliente lo vede"
                  : null
    };
}

/** Il chip «Nessuna regola li mostra» (§28.2). */
export function isShownByNoLiveRule(appearance: Appearance): boolean {
    return appearance.summary === "unassigned" || appearance.summary === "stoppedOnly";
}
