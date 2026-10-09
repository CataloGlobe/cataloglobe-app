import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import { isLayoutRuleDraft } from "@/utils/scheduleDraft";
import { romeDayOf } from "@/utils/romeInstant";
import { temporalScore } from "@shared/scheduleCompetition";

/**
 * Il Calendario della Programmazione (Officina, versione I dell'artifact).
 *
 * Modello «migliore» deciso con Alex (D120): ogni regola è una cosa, le
 * regole si sommano e si sceglie solo dove due toccano la stessa cosa.
 * - Menù e Stile: in ogni momento ne va in onda uno solo; vince il più
 *   vicino alla sede, poi gli orari più stretti, poi la priorità, poi il
 *   più recente (il resolver di oggi a parità tiene il più vecchio: da
 *   allineare insieme alle modifiche al database).
 * - Prezzi, Disponibilità, In evidenza: si sommano.
 * Oggi menù e stile stanno nella stessa regola Layout: qui diventano due
 * voci della stessa regola, una per corsia.
 */

export type CalKind = "menu" | "style" | "price" | "visibility" | "featured";
export const CAL_KINDS: readonly CalKind[] = ["menu", "style", "price", "visibility", "featured"];

/** Un giorno di Roma come numero (giorni dal 1/1/1970): si somma e si confronta. */
export type DayNum = number;

export type CalWhen = {
    /** Dal… al… compresi. */
    period?: { from: DayNum; to: DayNum };
    /** 0 = lunedì … 6 = domenica; assente = tutti i giorni. */
    days?: number[];
    /** Minuti dalla mezzanotte del giorno di servizio; la fine può passare 1440. */
    ranges?: [number, number][];
    /** Una regola che non va mai in onda (giorni vuoti, periodo senza fine). */
    never?: boolean;
};

export type CalWhere = { all: boolean; activityIds: string[]; groupIds: string[] };

export type CalEntry = {
    id: string;
    ruleId: string;
    kind: CalKind;
    /** Quello che si vede: il nome del menù, dello stile, del contenuto… */
    thing: string;
    where: CalWhere;
    when: CalWhen;
    /** Specificità temporale (periodo 4, fascia 2, giorni 1). */
    tscore: number;
    priority: number;
    created: number;
    /** Si somma agli altri (Prezzi, Disponibilità, In evidenza). */
    add: boolean;
    rule: LayoutRule;
    preview?: boolean;
};

export type CalNames = {
    catalogs: Map<string, string>;
    styles: Map<string, string>;
    featured: Map<string, string>;
    products: Map<string, string>;
};

export type CalSeat = { activityId: string; groupIds: readonly string[] };

const DAY_MS = 86_400_000;

export const dayNum = (year: number, month: number, day: number): DayNum => Math.round(Date.UTC(year, month, day) / DAY_MS);
export const dayParts = (d: DayNum) => {
    const x = new Date(d * DAY_MS);
    return { year: x.getUTCFullYear(), month: x.getUTCMonth(), day: x.getUTCDate() };
};
/** 0 = lunedì … 6 = domenica. */
export const dayOfWeek = (d: DayNum) => (new Date(d * DAY_MS).getUTCDay() + 6) % 7;
export const romeToday = (now: Date = new Date()): DayNum => {
    const r = romeDayOf(now);
    return dayNum(r.year, r.month, r.day);
};
const romeDayOfIso = (iso: string, shiftMs = 0): DayNum => {
    const r = romeDayOf(new Date(Date.parse(iso) + shiftMs));
    return dayNum(r.year, r.month, r.day);
};

const toMin = (t: string | null): number | null => {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

export function whenOfRule(rule: LayoutRule): CalWhen {
    const w: CalWhen = {};
    if (rule.start_at || rule.end_at) {
        if (rule.time_mode === "window" && rule.start_at && !rule.end_at) return { never: true };
        w.period = {
            from: rule.start_at ? romeDayOfIso(rule.start_at) : -Infinity,
            // la fine è esclusa: l'ultimo giorno è quello dell'istante appena prima
            to: rule.end_at ? romeDayOfIso(rule.end_at, -1) : Infinity
        };
    }
    if (rule.time_mode === "always") return w;
    if (rule.days_of_week) {
        if (rule.days_of_week.length === 0) return { never: true };
        if (rule.days_of_week.length < 7) w.days = rule.days_of_week.map(d => (d + 6) % 7).sort((a, b) => a - b);
    }
    const from = toMin(rule.time_from), to = toMin(rule.time_to);
    if (from !== null && to !== null) w.ranges = [[from, to <= from ? to + 1440 : to]];
    return w;
}

export const whereOfRule = (rule: LayoutRule): CalWhere => ({
    all: rule.applyToAll,
    activityIds: rule.activityIds,
    groupIds: rule.groupIds
});

export const eur = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const few = (names: string[]) => names.slice(0, 2).join(", ") + (names.length > 2 ? " +" + (names.length - 2) : "");

/** Le regole in onda (accese, complete) diventano le voci delle corsie. */
export function entriesFromRules(rules: readonly LayoutRule[], names: CalNames): CalEntry[] {
    const out: CalEntry[] = [];
    for (const rule of rules) {
        if (!rule.enabled || isLayoutRuleDraft(rule)) continue;
        const when = whenOfRule(rule);
        if (when.never) continue;
        const base = {
            ruleId: rule.id,
            where: whereOfRule(rule),
            when,
            tscore: temporalScore(rule),
            priority: rule.priority,
            created: Date.parse(rule.created_at) || 0,
            rule
        };
        const push = (kind: CalKind, thing: string, add: boolean, suffix: string = kind) =>
            out.push({ ...base, id: `${rule.id}:${suffix}`, kind, thing, add });
        if (rule.rule_type === "layout" && rule.layout) {
            const { catalog_id, style_id } = rule.layout;
            if (catalog_id) push("menu", names.catalogs.get(catalog_id) ?? "Menù", false);
            if (style_id) push("style", names.styles.get(style_id) ?? "Stile", false);
        } else if (rule.rule_type === "price") {
            const ps = rule.price_overrides;
            const label = (p: (typeof ps)[number]) => p.product_name ?? names.products.get(p.product_id) ?? "Prodotto";
            push("price", rule.name?.trim() || (ps.length === 1 ? `${label(ps[0])} a ${eur(ps[0].override_price)}` : few(ps.map(label))), true);
        } else if (rule.rule_type === "visibility") {
            const vs = rule.visibility_overrides;
            const label = (p: (typeof vs)[number]) => p.product_name ?? names.products.get(p.product_id) ?? "Prodotto";
            const auto = vs.length === 1 ? `${label(vs[0])} ${vs[0].mode === "disable" ? "non ordinabile" : "nascosto"}` : "Nascosti: " + few(vs.map(label));
            push("visibility", rule.name?.trim() || auto, true);
        } else if (rule.rule_type === "featured") {
            for (const c of rule.featured_contents) {
                push("featured", c.featured_content_title ?? names.featured.get(c.featured_content_id) ?? "Contenuto", true, `featured:${c.featured_content_id}`);
            }
        }
    }
    return out;
}

/* ---------- chi raggiunge la sede, quando ---------- */

export function specFor(e: CalEntry, seat: CalSeat): 0 | 1 | 2 | null {
    if (e.where.all) return 0;
    if (e.where.activityIds.includes(seat.activityId)) return 2;
    if (e.where.groupIds.some(g => seat.groupIds.includes(g))) return 1;
    return null;
}

export function okDate(w: CalWhen, d: DayNum): boolean {
    if (w.never) return false;
    if (w.period && (d < w.period.from || d > w.period.to)) return false;
    if (w.days && !w.days.includes(dayOfWeek(d))) return false;
    return true;
}

/**
 * In onda nel giorno di servizio `d` al minuto `m` (dopo mezzanotte m ≥ 1440).
 * Una fascia che il giorno dopo comincia prima dell'alba (00:30–02:00) si
 * vede in coda alla serata prima.
 */
export function inWin(w: CalWhen, d: DayNum, m: number): boolean {
    if (okDate(w, d) && (!w.ranges || w.ranges.some(([a, b]) => m >= a && m < b))) return true;
    if (m >= 1440 && w.ranges && okDate(w, d + 1)) return w.ranges.some(([a, b]) => m - 1440 >= a && m - 1440 < b);
    return false;
}

const SPEC_CACHE = new WeakMap<CalEntry, Map<string, 0 | 1 | 2 | null>>();
const spec = (e: CalEntry, seat: CalSeat) => {
    let m = SPEC_CACHE.get(e);
    if (!m) SPEC_CACHE.set(e, (m = new Map()));
    if (!m.has(seat.activityId)) m.set(seat.activityId, specFor(e, seat));
    return m.get(seat.activityId)!;
};

/** Chi vince fra due menù (o due stili) nello stesso momento: il primo. */
export function order(seat: CalSeat) {
    return (a: CalEntry, b: CalEntry) =>
        (spec(b, seat) ?? -1) - (spec(a, seat) ?? -1) ||
        b.tscore - a.tscore ||
        a.priority - b.priority ||
        b.created - a.created ||
        (a.id < b.id ? -1 : 1);
}

/** Perché `w` vince su `l`, in una frase. */
export function why(w: CalEntry, l: CalEntry, seat: CalSeat, whereFor: (e: CalEntry) => string): string {
    const sw = spec(w, seat) ?? -1, sl = spec(l, seat) ?? -1;
    if (sw !== sl) return `vale ${whereFor(w)}, l'altro ${whereFor(l)}: vince il più vicino alla sede`;
    if (w.tscore !== l.tscore) return "ha orari più stretti";
    if (w.priority !== l.priority) return "ha la priorità più alta";
    return "è il più recente";
}

/* ---------- le corsie ---------- */

export const FSLOT = 15;

export type Axis = { from: number; to: number };

/** Le ore del calendario: dalle 8 a mezzanotte, allargate a quello che c'è. */
export function axisFor(entries: readonly CalEntry[]): Axis {
    let from = 8 * 60, to = 24 * 60;
    for (const e of entries) for (const [a, b] of e.when.ranges ?? []) {
        if (b > 1440) to = Math.max(to, Math.min(30 * 60, Math.ceil(b / 60) * 60));
        else from = Math.min(from, Math.floor(a / 60) * 60);
    }
    return { from: Math.max(0, from), to };
}

export type FState = { onda: string[]; hidden: string[]; win: CalEntry | null; reps: CalEntry[] };

export type DayCtx = { kind: CalKind; seat: CalSeat; day: DayNum; cands: CalEntry[] };

/** Le voci di un tipo che quel giorno toccano la sede (il calcolo per minuto parte da qui). */
export function dayCtx(entries: readonly CalEntry[], kind: CalKind, seat: CalSeat, day: DayNum): DayCtx {
    const cands = entries.filter(
        e => e.kind === kind && spec(e, seat) !== null && (okDate(e.when, day) || (!!e.when.ranges && okDate(e.when, day + 1)))
    );
    return { kind, seat, day, cands };
}

export function fState(ctx: DayCtx, m: number): FState {
    const c = ctx.cands.filter(e => inWin(e.when, ctx.day, m));
    const adds = c.filter(e => e.add);
    const reps = c.filter(e => !e.add).sort(order(ctx.seat));
    const win = reps[0] ?? null;
    const onda = [...new Set([...(win ? [win.thing] : []), ...adds.map(e => e.thing)])];
    const hidden = [...new Set(reps.slice(1).map(e => e.thing))].filter(t => !onda.includes(t));
    return { onda, hidden, win, reps };
}

export type LaneSeg = FState & { key: string; from: number; to: number };

/** Corsia chiusa: tratti in cui non cambia chi è in onda né chi sta sotto. */
export function fLane(ctx: DayCtx, axis: Axis): LaneSeg[] {
    const segs: LaneSeg[] = [];
    let cur: LaneSeg | null = null;
    for (let m = axis.from; m < axis.to; m += FSLOT) {
        const st = fState(ctx, m), key = st.onda.join("|") + "#" + st.hidden.join("|");
        if (cur && cur.key === key) { cur.to = m + FSLOT; continue; }
        if (cur && cur.onda.length) segs.push(cur);
        cur = { key, from: m, to: m + FSLOT, ...st };
    }
    if (cur && cur.onda.length) segs.push(cur);
    return segs;
}

export type LineSeg = {
    key: string;
    state: "on" | "off";
    /** Chi la copre, dove non si vede. */
    by: string;
    /** Chi copre lei, dove vince. */
    covers: string[];
    from: number;
    to: number;
    win: CalEntry | null;
    self: CalEntry | null;
    reps: CalEntry[];
    with: string[];
};
export type Line = { thing: string; add: boolean; preview: boolean; segs: LineSeg[] };

/** Corsia aperta: una linea per cosa, piena dove si vede, tratteggiata dove la copre un'altra. */
export function fLines(ctx: DayCtx, axis: Axis): Line[] {
    const things = [...new Set(ctx.cands.map(e => e.thing))];
    const o = order(ctx.seat);
    const rank = (t: string) => {
        const es = ctx.cands.filter(e => e.thing === t), best = es.slice().sort(o)[0];
        return [es.every(e => e.add) ? 1 : 0, -(spec(best, ctx.seat) ?? 0), -best.tscore, best.created];
    };
    const ranks = new Map(things.map(t => [t, rank(t)]));
    things.sort((a, b) => {
        const A = ranks.get(a)!, B = ranks.get(b)!;
        for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return A[i] - B[i];
        return 0;
    });
    const states: FState[] = [];
    for (let m = axis.from; m < axis.to; m += FSLOT) states.push(fState(ctx, m));
    return things.map(t => {
        const segs: LineSeg[] = [];
        let cur: (Omit<LineSeg, "state"> & { state: LineSeg["state"] | null }) | null = null;
        const flush = () => {
            if (cur && cur.state) segs.push({ ...cur, state: cur.state });
        };
        for (let i = 0; i < states.length; i++) {
            const st = states[i], m = axis.from + i * FSLOT;
            const self = ctx.cands.find(e => e.thing === t && inWin(e.when, ctx.day, m)) ?? null;
            const state = st.onda.includes(t) ? "on" : self ? "off" : null;
            const by = state === "off" && st.win ? st.win.thing : "";
            const covers = state === "on" && st.win && st.win.thing === t ? st.hidden : [];
            const key = state + "|" + by + "|" + covers.join(",");
            if (cur && cur.key === key) { cur.to = m + FSLOT; continue; }
            flush();
            cur = { key, state, by, covers, from: m, to: m + FSLOT, win: st.win, self, reps: st.reps, with: st.onda.filter(x => x !== t) };
        }
        flush();
        const es = ctx.cands.filter(e => e.thing === t);
        return { thing: t, add: es.every(e => e.add), preview: es.some(e => e.preview), segs };
    }).filter(l => l.segs.length > 0 || l.preview); // una regola che quel giorno non c'è non fa linea
}

/* ---------- testi ---------- */

export const KIND_LABEL: Record<CalKind, string> = {
    menu: "Menù",
    style: "Stile",
    price: "Prezzi",
    visibility: "Disponibilità",
    featured: "In evidenza"
};

export const hhmm = (m: number) => {
    const x = ((m % 1440) + 1440) % 1440;
    return String(Math.floor(x / 60)).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0");
};
export const q = (n: string) => "«" + n + "»";
export const shortName = (n: string) => {
    const x = n.replace(/^Menù /i, "");
    return x.charAt(0).toUpperCase() + x.slice(1);
};

/* ---------- quando, in parole ---------- */
const DAY_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MONTH_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const dayShort = (d: DayNum) => {
    const p = dayParts(d);
    return p.day + " " + MONTH_SHORT[p.month];
};

/** «Lun–Ven», «Sab, Dom», «Lun, Mer–Ven». */
export function daysText(days?: readonly number[]): string {
    if (!days || days.length === 7) return "tutti i giorni";
    const d = [...days].sort((a, b) => a - b), runs: string[] = [];
    let st = d[0], pv = d[0];
    for (let i = 1; i <= d.length; i++) {
        if (d[i] === pv + 1) {
            pv = d[i];
            continue;
        }
        runs.push(st === pv ? DAY_SHORT[st] : pv === st + 1 ? DAY_SHORT[st] + ", " + DAY_SHORT[pv] : DAY_SHORT[st] + "–" + DAY_SHORT[pv]);
        st = d[i];
        pv = d[i];
    }
    return runs.join(", ");
}

/** «10 ott – 12 ott · 19:00–23:30», «Lun–Ven · 11:00–15:00», «Sempre, tutto il giorno». */
export function durLabel(w: CalWhen): string {
    const p: string[] = [];
    if (w.period) p.push(dayShort(w.period.from) + " – " + dayShort(w.period.to));
    if (w.days && w.days.length < 7) p.push(daysText(w.days));
    else if (!w.period && (w.days || w.ranges)) p.push("Tutti i giorni");
    if (w.ranges) p.push(w.ranges.map(([a, b]) => hhmm(a) + "–" + hhmm(b)).join(", "));
    else if (w.period || w.days) p.push("tutto il giorno");
    return p.length ? p.join(" · ") : "Sempre, tutto il giorno";
}

