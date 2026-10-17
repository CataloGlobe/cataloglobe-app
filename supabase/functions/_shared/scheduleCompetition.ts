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

// ── Giudice nuovo (fase (b) del pacchetto database dell'Officina) ──────────
//
// Piano 9b, passo 3. Legge le fasce (M1, `schedule_slots`), anche quelle di
// ieri che passano la mezzanotte, e le loro sedi (M2, `schedule_slot_targets`).
// Per strato:
// - menù (M5): le regole `layout` sono lette come un menù più uno stile, ma
//   fra loro ne vince una sola con l'ordine di oggi (`compareCandidates`, D83)
//   finché il back office non scrive il modello nuovo (passo 5). Quella e le
//   regole `menu` «al posto degli altri» (`replace`) attive: si mostra solo la
//   più nuova per `on_air_since`; se non ce n'è, tutte le `together` attive;
// - stile (M5): vince la `replace` più nuova (la `layout` vincente conta come
//   `replace`); se non ce n'è, la `keep` più vecchia;
// - prezzi, disponibilità, in evidenza (M6): valgono tutte le attive, in un
//   ordine di precedenza (`compareStacked`): per lo stesso piatto vince la
//   prima che lo tocca. La somma la fa il resolver.
// La scelta per sede (`schedule_targets.overlap_mode`) vale per la riga più
// precisa che raggiunge la sede: sede, poi gruppo, poi la regola.

export type JudgeRuleType = "layout" | "menu" | "style" | "price" | "visibility" | "featured";

export const JUDGE_RULE_TYPES: readonly JudgeRuleType[] = [
    "layout",
    "menu",
    "style",
    "price",
    "visibility",
    "featured"
];

export type OverlapMode = "together" | "replace" | "keep";

/** Una fascia (M1): minuti dalla mezzanotte, la fine può passare 1440. */
export type JudgeSlot = {
    id: string;
    /** null = ogni giorno, [] = mai. È il giorno in cui la fascia comincia. */
    days_of_week: readonly number[] | null;
    start_minute: number;
    end_minute: number;
    /** Sedi della fascia (M2); tutte e due vuote = tutte le sedi della regola. */
    activityIds: readonly string[];
    groupIds: readonly string[];
};

export type JudgeRule = {
    id: string;
    rule_type: JudgeRuleType;
    enabled: boolean;
    priority: number;
    created_at: string;
    on_air_since: string;
    /** Solo per l'eccezione di oggi: «Fascia» con inizio e senza fine non vale mai. */
    time_mode: "always" | "window";
    start_at: string | null;
    end_at: string | null;
    applyToAll: boolean;
    activityIds: readonly string[];
    groupIds: readonly string[];
    /** Nessuna fascia = tutto il giorno, ogni giorno. */
    slots: readonly JudgeSlot[];
    /** `schedules.overlap_mode`; null = il valore di partenza del tipo. */
    overlap_mode: OverlapMode | null;
    /** `schedule_targets.overlap_mode` per sede e per gruppo, se l'utente l'ha chiesto. */
    overlapByActivity?: Readonly<Record<string, OverlapMode>>;
    overlapByGroup?: Readonly<Record<string, OverlapMode>>;
    /** layout e menu: false se la regola non ha un menù (non vince, passa la successiva). */
    hasMenu?: boolean;
    /** layout e style: false se la regola non ha uno stile. */
    hasStyle?: boolean;
    /**
     * Solo `layout`: `temporalScore` sulle colonne di oggi (`time_from`/`time_to`,
     * `days_of_week`). Le fasce del ponte non lo ridanno uguale: «Fascia 00:00-23:59»
     * diventa 0-1440 e perderebbe il +2 degli orari. Se manca, si calcola dalle fasce.
     */
    todayTemporalScore?: number;
};

export type JudgeEntry<R extends JudgeRule = JudgeRule> = {
    rule: R;
    specificity: CompetitionSpecificity;
};

export type JudgeVerdict<R extends JudgeRule = JudgeRule> = {
    /** I menù che il cliente vede adesso, dal più nuovo (l'ordine dei riquadri lo dà `catalogs.sort_order`). */
    menus: JudgeEntry<R>[];
    /** Menù attivi che non si vedono: coperti da un «al posto degli altri», o `layout` che perdono con l'ordine di oggi. */
    coveredMenus: JudgeEntry<R>[];
    /** L'«al posto degli altri» che copre i `coveredMenus`, o null. */
    menuCover: JudgeEntry<R> | null;
    /** La regola (layout o style) che dà lo stile, o null. */
    style: JudgeEntry<R> | null;
    coveredStyles: JudgeEntry<R>[];
    /** Attive, nell'ordine di precedenza per piatto: la prima che tocca un piatto vince. */
    price: JudgeEntry<R>[];
    visibility: JudgeEntry<R>[];
    featured: JudgeEntry<R>[];
    /** Abilitate che raggiungono la sede, a qualunque ora, per tipo. */
    candidates: Record<JudgeRuleType, JudgeEntry<R>[]>;
};

/** La fascia vale per la sede? Senza sedi proprie vale per tutte quelle della regola. */
function slotReaches(slot: JudgeSlot, seat: CompetitionSeat): boolean {
    if (slot.activityIds.length === 0 && slot.groupIds.length === 0) return true;
    if (slot.activityIds.includes(seat.activityId)) return true;
    return slot.groupIds.some(groupId => seat.groupIds.includes(groupId));
}

function slotAllows(slot: JudgeSlot, dayOfWeek: number): boolean {
    return slot.days_of_week === null || slot.days_of_week.includes(dayOfWeek);
}

/** La fascia è attiva adesso: partita oggi, o partita ieri e oltre la mezzanotte. */
export function isSlotActiveAt(slot: JudgeSlot, now: RomeDateTime): boolean {
    const minute = now.hour * 60 + now.minute;
    if (slotAllows(slot, now.dayOfWeek) && slot.start_minute <= minute && minute < slot.end_minute) {
        return true;
    }
    const yesterday = (now.dayOfWeek + 6) % 7;
    return slot.end_minute > 1440 && slotAllows(slot, yesterday) && minute < slot.end_minute - 1440;
}

/** Il periodo della regola, come oggi (inizio incluso, fine esclusa). */
function isPeriodActive(rule: JudgeRule, now: RomeDateTime): boolean {
    if (rule.start_at && now.epoch < new Date(rule.start_at).getTime()) return false;
    if (rule.end_at && now.epoch >= new Date(rule.end_at).getTime()) return false;
    if (rule.time_mode === "window" && rule.start_at && !rule.end_at) return false;
    return true;
}

/**
 * La regola è attiva nella sede adesso: periodo, poi una delle sue fasce che
 * raggiunge la sede. Senza fasce vale sempre; con fasce, ma nessuna per questa
 * sede, qui non vale.
 */
export function isJudgeRuleActiveAt(rule: JudgeRule, seat: CompetitionSeat, now: RomeDateTime): boolean {
    if (!isPeriodActive(rule, now)) return false;
    if (rule.slots.length === 0) return true;
    return rule.slots.some(slot => slotReaches(slot, seat) && isSlotActiveAt(slot, now));
}

/**
 * La regola è attiva adesso in almeno una sede: periodo, poi una qualunque
 * delle sue fasce. È l'«Adesso» dell'elenco del back office, che non guarda
 * una sede sola.
 */
export function isJudgeRuleActiveAnywhereAt(rule: JudgeRule, now: RomeDateTime): boolean {
    if (!isPeriodActive(rule, now)) return false;
    return rule.slots.length === 0 || rule.slots.some(slot => isSlotActiveAt(slot, now));
}

/** Il punteggio di `temporalScore` letto dalle fasce: periodo 4, ore 2, giorni 1. */
export function judgeTemporalScore(rule: JudgeRule): number {
    let score = 0;
    if (rule.start_at || rule.end_at) score += 4;
    if (rule.slots.some(s => s.start_minute !== 0 || s.end_minute !== 1440)) score += 2;
    if (rule.slots.some(s => s.days_of_week !== null && s.days_of_week.length > 0)) score += 1;
    return score;
}

function byCreatedThenId(a: JudgeRule, b: JudgeRule): number {
    const delta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
}

/** L'ordine di oggi (`compareCandidates`), col punteggio delle fasce: solo fra regole `layout` (D83). */
function compareLayoutToday(a: JudgeEntry, b: JudgeEntry): number {
    if (a.specificity !== b.specificity) return b.specificity - a.specificity;
    const score = (rule: JudgeRule) => rule.todayTemporalScore ?? judgeTemporalScore(rule);
    const temporalDelta = score(b.rule) - score(a.rule);
    if (temporalDelta !== 0) return temporalDelta;
    if (a.rule.priority !== b.rule.priority) return a.rule.priority - b.rule.priority;
    return byCreatedThenId(a.rule, b.rule);
}

function onAirDelta(a: JudgeRule, b: JudgeRule): number {
    return new Date(a.on_air_since).getTime() - new Date(b.on_air_since).getTime();
}

/** La più nuova prima (`on_air_since`), poi `id`. */
function newestFirst(a: JudgeEntry, b: JudgeEntry): number {
    const delta = onAirDelta(b.rule, a.rule);
    return delta !== 0 ? delta : a.rule.id.localeCompare(b.rule.id);
}

/** La più vecchia prima (`on_air_since`), poi `id`. */
function oldestFirst(a: JudgeEntry, b: JudgeEntry): number {
    const delta = onAirDelta(a.rule, b.rule);
    return delta !== 0 ? delta : a.rule.id.localeCompare(b.rule.id);
}

/**
 * Precedenza fra regole che si sommano (M6), per lo stesso piatto: sede, poi
 * orari più stretti (→ D87), poi la più nuova, poi `id`.
 */
export function compareStacked(a: JudgeEntry, b: JudgeEntry): number {
    if (a.specificity !== b.specificity) return b.specificity - a.specificity;
    const temporalDelta = judgeTemporalScore(b.rule) - judgeTemporalScore(a.rule);
    if (temporalDelta !== 0) return temporalDelta;
    return newestFirst(a, b);
}

/**
 * L'ordine in cui il giudice legge le regole dello stesso tipo: le `layout` con
 * l'ordine di oggi, menù e stili dal più nuovo, gli altri con `compareStacked`.
 * Serve agli elenchi del back office, per mostrarle nello stesso ordine. Fra
 * tipi diversi non è un ordine (non è simmetrico): si confronta dentro un tipo.
 */
export function compareJudgeEntries(a: JudgeEntry, b: JudgeEntry): number {
    if (a.rule.rule_type === "layout" && b.rule.rule_type === "layout") return compareLayoutToday(a, b);
    if (a.rule.rule_type === "menu" || a.rule.rule_type === "style") return newestFirst(a, b);
    return compareStacked(a, b);
}

/** I valori che hanno senso per il tipo: menù «insieme» o «al posto», stile «al posto» o «tieni». */
function overlapModesOf(ruleType: JudgeRuleType): readonly OverlapMode[] {
    if (ruleType === "menu") return ["together", "replace"];
    if (ruleType === "style") return ["replace", "keep"];
    return ["replace"];
}

/**
 * La scelta dell'incrocio per questa sede: riga della sede, poi del gruppo, poi la
 * regola. Un valore che non vale per il tipo (un menù «tieni», uno stile «insieme»)
 * si salta, così la regola non si spegne per un dato sbagliato.
 */
export function overlapModeFor(rule: JudgeRule, seat: CompetitionSeat): OverlapMode {
    const allowed = overlapModesOf(rule.rule_type);
    const valid = (mode: OverlapMode | null | undefined): mode is OverlapMode =>
        mode !== null && mode !== undefined && allowed.includes(mode);
    const byActivity = rule.overlapByActivity?.[seat.activityId];
    if (valid(byActivity)) return byActivity;
    if (rule.overlapByGroup) {
        const groupModes = seat.groupIds
            .map(groupId => rule.overlapByGroup?.[groupId])
            .filter(valid)
            .sort();
        // Due gruppi della sede con scelte diverse: vale la prima in ordine
        // alfabetico ("keep" < "replace" < "together"), così il risultato non
        // dipende dall'ordine dei gruppi.
        if (groupModes.length > 0) return groupModes[0];
    }
    if (valid(rule.overlap_mode)) return rule.overlap_mode;
    return rule.rule_type === "menu" ? "together" : "replace";
}

/** Il verdetto del giudice nuovo per una sede in un istante. */
export function judge<R extends JudgeRule>(
    rules: readonly R[],
    seat: CompetitionSeat,
    now: RomeDateTime
): JudgeVerdict<R> {
    const candidates = {} as Record<JudgeRuleType, JudgeEntry<R>[]>;
    const active = {} as Record<JudgeRuleType, JudgeEntry<R>[]>;
    for (const type of JUDGE_RULE_TYPES) {
        candidates[type] = [];
        active[type] = [];
    }
    for (const rule of rules) {
        if (!rule.enabled) continue;
        const specificity = specificityFor(rule, seat);
        if (specificity === null) continue;
        const entry: JudgeEntry<R> = { rule, specificity };
        candidates[rule.rule_type].push(entry);
        if (isJudgeRuleActiveAt(rule, seat, now)) active[rule.rule_type].push(entry);
    }

    // Layout: una sola, con l'ordine di oggi (D83); senza menù non vince.
    candidates.layout.sort(compareLayoutToday);
    const layouts = active.layout.sort(compareLayoutToday);
    const layoutWinner = layouts.find(entry => entry.rule.hasMenu !== false) ?? null;
    const losingLayouts = layouts.filter(entry => entry !== layoutWinner && entry.rule.hasMenu !== false);

    // Menù.
    const menus = active.menu.filter(entry => entry.rule.hasMenu !== false);
    const replaceMenus = menus.filter(entry => overlapModeFor(entry.rule, seat) === "replace");
    if (layoutWinner) replaceMenus.push(layoutWinner);
    replaceMenus.sort(newestFirst);
    // L'«al posto» più nuovo copre solo ciò che è più vecchio di lui: un
    // «insieme» messo in onda dopo gli si aggiunge (D129); a pari data copre.
    const replaceWinner = replaceMenus[0] ?? null;
    const shownMenus: JudgeEntry<R>[] = menus
        .filter(entry => overlapModeFor(entry.rule, seat) === "together")
        .filter(entry => !replaceWinner || onAirDelta(entry.rule, replaceWinner.rule) > 0);
    if (replaceWinner) shownMenus.push(replaceWinner);
    shownMenus.sort(newestFirst);
    const coveredMenus = [...menus, ...(layoutWinner ? [layoutWinner] : []), ...losingLayouts]
        .filter(entry => !shownMenus.includes(entry))
        .sort(newestFirst);

    // Stile: la layout vincente porta il suo stile come «replace».
    const styles = active.style.filter(entry => entry.rule.hasStyle !== false);
    const styleCandidates = [...styles];
    if (layoutWinner && layoutWinner.rule.hasStyle !== false) styleCandidates.push(layoutWinner);
    const replaceStyles = styleCandidates
        .filter(entry => entry.rule.rule_type === "layout" || overlapModeFor(entry.rule, seat) === "replace")
        .sort(newestFirst);
    const keepStyles = styleCandidates
        .filter(entry => entry.rule.rule_type !== "layout" && overlapModeFor(entry.rule, seat) === "keep")
        .sort(oldestFirst);
    const styleWinner = replaceStyles[0] ?? keepStyles[0] ?? null;
    const coveredStyles = [...replaceStyles, ...keepStyles].filter(entry => entry !== styleWinner);

    for (const type of ["menu", "style", "price", "visibility", "featured"] as const) {
        candidates[type].sort(type === "menu" || type === "style" ? newestFirst : compareStacked);
    }

    return {
        menus: shownMenus,
        coveredMenus,
        menuCover: replaceWinner,
        style: styleWinner,
        coveredStyles,
        price: active.price.sort(compareStacked),
        visibility: active.visibility.sort(compareStacked),
        featured: active.featured.sort(compareStacked),
        candidates
    };
}

/** Un menù di più tardi oggi, con la sua prima fascia in cui si vedrà. */
export type LaterMenu<R extends JudgeRule = JudgeRule> = {
    entry: JudgeEntry<R>;
    startMinute: number;
    endMinute: number;
};

/** I minuti di oggi in cui il verdetto può cambiare, dopo `fromMinute`. */
function boundariesToday(
    rules: readonly JudgeRule[],
    fromMinute: number,
    instantAt: (minuteOfDay: number) => RomeDateTime
): number[] {
    const cuts = new Set<number>();
    for (const rule of rules) {
        for (const slot of rule.slots) {
            for (const m of [slot.start_minute, slot.end_minute, slot.end_minute - 1440]) {
                if (m > fromMinute && m < 1440) cuts.add(m);
            }
        }
        // Anche inizio e fine del periodo, se cadono oggi dopo adesso: un menù che
        // parte alle 11 è «più tardi», uno che finisce alle 15 finisce lì.
        for (const iso of [rule.start_at, rule.end_at]) {
            if (!iso) continue;
            const m = firstMinuteFrom(new Date(iso).getTime(), fromMinute, instantAt);
            if (m !== null) cuts.add(m);
        }
    }
    return [...cuts].sort((a, b) => a - b);
}

/** Il primo minuto di oggi dopo `fromMinute` che arriva a `epoch`; null se è già passato o non è oggi. */
function firstMinuteFrom(
    epoch: number,
    fromMinute: number,
    instantAt: (minuteOfDay: number) => RomeDateTime
): number | null {
    const reached = (minute: number) => instantAt(minute).epoch >= epoch;
    if (fromMinute >= 1439 || reached(fromMinute) || !reached(1439)) return null;
    let lo = fromMinute + 1;
    let hi = 1439;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (reached(mid)) hi = mid;
        else lo = mid + 1;
    }
    return lo;
}

/**
 * La fascia di oggi che mostra la regola nell'istante dato, in minuti da
 * questa mezzanotte (la fine può passare 1440; una fascia partita ieri ha
 * l'inizio a 0). Senza fasce: tutto il giorno.
 */
export function activeWindowToday(
    rule: JudgeRule,
    seat: CompetitionSeat,
    now: RomeDateTime
): { startMinute: number; endMinute: number } {
    const minute = now.hour * 60 + now.minute;
    for (const slot of rule.slots) {
        if (!slotReaches(slot, seat)) continue;
        if (slotAllows(slot, now.dayOfWeek) && slot.start_minute <= minute && minute < slot.end_minute) {
            return { startMinute: slot.start_minute, endMinute: slot.end_minute };
        }
        const yesterday = (now.dayOfWeek + 6) % 7;
        if (slot.end_minute > 1440 && slotAllows(slot, yesterday) && minute < slot.end_minute - 1440) {
            return { startMinute: 0, endMinute: slot.end_minute - 1440 };
        }
    }
    return { startMinute: 0, endMinute: 1440 };
}

/**
 * «Più tardi» (scelta 1 del 2026-10-13): i menù che il giudice mostrerà oggi
 * dopo adesso e che adesso non si vedono, con l'ora della prima volta. Si
 * chiede al giudice a ogni minuto in cui qualcosa può cambiare; `instantAt`
 * dà l'istante di Roma di un minuto di oggi (il chiamante sa dell'ora legale).
 */
export function laterMenusToday<R extends JudgeRule>(
    rules: readonly R[],
    seat: CompetitionSeat,
    now: RomeDateTime,
    instantAt: (minuteOfDay: number) => RomeDateTime
): LaterMenu<R>[] {
    const nowMinute = now.hour * 60 + now.minute;
    const shownNow = new Set(judge(rules, seat, now).menus.map(entry => entry.rule.id));
    const found = new Map<string, LaterMenu<R>>();
    const cuts = boundariesToday(rules, nowMinute, instantAt);
    for (let i = 0; i < cuts.length; i++) {
        const at = instantAt(cuts[i]);
        for (const entry of judge(rules, seat, at).menus) {
            const id = entry.rule.id;
            if (shownNow.has(id) || found.has(id)) continue;
            // Fin quando si vede: il primo taglio dopo in cui il giudice non lo mostra più.
            let endMinute = activeWindowToday(entry.rule, seat, at).endMinute;
            for (let j = i + 1; j < cuts.length; j++) {
                const still = judge(rules, seat, instantAt(cuts[j])).menus.some(e => e.rule.id === id);
                if (!still) {
                    endMinute = Math.min(endMinute, cuts[j]);
                    break;
                }
            }
            found.set(id, { entry, startMinute: cuts[i], endMinute });
        }
    }
    return [...found.values()].sort((a, b) => a.startMinute - b.startMinute);
}
