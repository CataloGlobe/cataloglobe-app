// La sezione Aggiungi / Modifica completa (versione 10 dell'artifact, opzione I in C):
// la bozza di quello che si mette in calendario, le frasi che la raccontano e
// la strada per salvarla sul database di oggi.
//
// Il database di oggi (D122 → A): una sola fascia oraria per regola e mai dopo
// mezzanotte; menù e stile nella stessa regola Layout; il multi menù non c'è.
// Quelle parti nella sezione ci sono già, spente, e si accendono quando Lorenzo
// cambia il database.
import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import {
    KIND_LABEL,
    dayParts,
    durLabel,
    eur,
    hhmm,
    whenOfRule,
    whereOfRule,
    type CalEntry,
    type CalKind,
    type CalWhen,
    type CalWhere,
    type DayNum
} from "./calendarModel";

export const isDish = (k: CalKind) => k === "price" || k === "visibility";

/** Quanto il database di oggi regge della versione 10. */
export const DB_TODAY = { multiRange: false, overnight: false, multiMenu: false, splitLayout: false } as const;
export const DB_LATER = "arriva col database nuovo";

export type PickProduct = {
    id: string;
    name: string;
    category: string | null;
    listPrice: number | null;
    formats: { id: string; name: string }[];
};
export type PickThing = { id: string; name: string };

export type Draft = {
    mode: "add" | "edit";
    kind: CalKind;
    /** In modifica: la regola di partenza. */
    rule: LayoutRule | null;
    /**
     * In modifica di una sola voce di una regola che ne ha più d'una
     * (un piatto, un contenuto In evidenza): il suo id.
     */
    only: string | null;
    step: number;
    seen: number;
    tried: boolean;
    /** I piatti scelti (id dei prodotti), nell'ordine del listino. */
    picks: string[];
    /** Prezzo nuovo per prodotto, o per prodotto:formato. */
    prices: Record<string, number | null>;
    strike: boolean;
    hide: "hide" | "disable";
    /** L'id del menù, dello stile o del contenuto In evidenza. */
    thing: string | null;
    /** Oggi: lo stile che sta nella regola del menù (o il menù di quella dello stile). */
    pair: string | null;
    when: CalWhen;
    where: CalWhere;
    /** Il nome scritto da chi modifica; null = quello che mettiamo noi. */
    name: string | null;
    orig: string;
    before: string | null;
};

export type DraftLookups = {
    products: ReadonlyMap<string, PickProduct>;
    catalogs: ReadonlyMap<string, string>;
    styles: ReadonlyMap<string, string>;
    featured: ReadonlyMap<string, string>;
    sedi: ReadonlyMap<string, string>;
    groups: ReadonlyMap<string, string>;
    multi: boolean;
};

export const priceKey = (productId: string, formatId?: string | null) => (formatId ? productId + ":" + formatId : productId);
export const priceKeys = (p: PickProduct | undefined, id: string) => (p && p.formats.length ? p.formats.map(f => priceKey(id, f.id)) : [id]);

const cloneWhen = (w: CalWhen): CalWhen => ({
    ...(w.period ? { period: { ...w.period } } : {}),
    ...(w.days ? { days: [...w.days] } : {}),
    ...(w.ranges ? { ranges: w.ranges.map(r => [r[0], r[1]] as [number, number]) } : {})
});
const cloneWhere = (w: CalWhere): CalWhere => ({ all: w.all, activityIds: [...w.activityIds], groupIds: [...w.groupIds] });

export const whenKey = (w: CalWhen) =>
    [w.period ? w.period.from + ">" + w.period.to : "", w.days ? w.days.join("") : "", w.ranges ? w.ranges.map(r => r.join("-")).join(",") : ""].join("|");
export const whereKey = (w: CalWhere) => (w.all ? "all" : "a:" + [...w.activityIds].sort().join(",") + "|g:" + [...w.groupIds].sort().join(","));
export const snap = (D: Draft) =>
    JSON.stringify([D.kind, D.picks, D.prices, D.strike, D.hide, D.thing, D.pair, whenKey(D.when), whereKey(D.where), D.name]);
export const isDirty = (D: Draft | null) => !!D && !!D.kind && snap(D) !== D.orig;

export function blankDraft(kind: CalKind, where: CalWhere, pair: string | null): Draft {
    const D: Draft = {
        mode: "add",
        kind,
        rule: null,
        only: null,
        step: 0,
        seen: 0,
        tried: false,
        picks: [],
        prices: {},
        strike: true,
        hide: "hide",
        thing: null,
        pair: kind === "menu" || kind === "style" ? pair : null,
        when: {},
        where: cloneWhere(where),
        name: null,
        orig: "",
        before: null
    };
    D.orig = snap(D);
    return D;
}

/**
 * Dalla voce del calendario alla bozza in modifica. `only` è il piatto o il
 * contenuto toccato quando si modifica solo lui.
 */
export function draftFromEntry(e: CalEntry, L: DraftLookups, only: string | null = null): Draft {
    const r = e.rule;
    const D: Draft = {
        mode: "edit",
        kind: e.kind,
        rule: r,
        only: null,
        step: 0,
        seen: 9,
        tried: false,
        picks: [],
        prices: {},
        strike: true,
        hide: "hide",
        thing: null,
        pair: null,
        when: cloneWhen(whenOfRule(r)),
        where: cloneWhere(whereOfRule(r)),
        name: r.name?.trim() || null,
        orig: "",
        before: null
    };
    if (e.kind === "price") {
        const os = r.price_overrides.filter(o => !only || o.product_id === only);
        D.picks = sortPicks([...new Set(os.map(o => o.product_id))], L);
        for (const o of os) D.prices[priceKey(o.product_id, o.option_value_id)] = o.override_price;
        D.strike = os.some(o => o.show_original_price);
        D.only = only && r.price_overrides.some(o => o.product_id !== only) ? only : null;
    } else if (e.kind === "visibility") {
        const os = r.visibility_overrides.filter(o => !only || o.product_id === only);
        D.picks = sortPicks(os.map(o => o.product_id), L);
        D.hide = os.some(o => o.mode === "disable") ? "disable" : "hide";
        D.only = only && r.visibility_overrides.some(o => o.product_id !== only) ? only : null;
    } else if (e.kind === "featured") {
        const id = e.id.split(":featured:")[1] ?? null;
        D.thing = id;
        D.only = id && r.featured_contents.length > 1 ? id : null;
    } else if (e.kind === "menu") {
        D.thing = r.layout?.catalog_id ?? null;
        D.pair = r.layout?.style_id ?? null;
    } else {
        D.thing = r.layout?.style_id ?? null;
        D.pair = r.layout?.catalog_id ?? null;
    }
    // modificando un piatto solo, il nome della regola non è il suo
    if (D.only) D.name = null;
    D.orig = snap(D);
    D.before = sentence(D, L);
    return D;
}

export function sortPicks(ids: string[], L: DraftLookups): string[] {
    const ix = new Map([...L.products.keys()].map((id, i) => [id, i]));
    return ids.sort((a, b) => (ix.get(a) ?? 1e9) - (ix.get(b) ?? 1e9));
}

/** Cosa manca per salvare; "" se niente. */
export function missing(D: Draft, L: DraftLookups): string {
    if (isDish(D.kind)) {
        if (!D.picks.length) return "Scegli almeno un piatto";
        if (D.kind === "price" && D.picks.some(id => priceKeys(L.products.get(id), id).some(k => !(D.prices[k]! > 0)))) return "Manca un prezzo";
        return "";
    }
    if (!D.thing) return D.kind === "menu" ? "Scegli un menù" : D.kind === "style" ? "Scegli uno stile" : "Scegli un In evidenza";
    if (D.kind === "menu" && !D.pair) return "Scegli lo stile che va col menù";
    if (D.kind === "style" && !D.pair) return "Scegli il menù che va con lo stile";
    if (!D.where.all && !D.where.activityIds.length && !D.where.groupIds.length) return "Scegli almeno una sede";
    return "";
}

/** Gli errori che il database di oggi non lascerebbe passare. */
export function invalid(D: Draft): string {
    const p = D.when.period;
    if (p && p.to < p.from) return "La fine del periodo viene prima dell'inizio";
    const rs = D.when.ranges;
    if (rs && rs.some(([a, b]) => b <= a)) return "Una fascia finisce prima di cominciare";
    if (rs && !DB_TODAY.overnight && rs.some(([, b]) => b > 1440)) return "Dopo mezzanotte " + DB_LATER;
    if (rs && !DB_TODAY.multiRange && rs.length > 1) return "Più fasce " + DB_LATER;
    if (!D.where.all && !D.where.activityIds.length && !D.where.groupIds.length) return "Scegli almeno una sede";
    return "";
}

/* ---------- le frasi ---------- */

const MONTH_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const DAYS_L = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
export const mShort = (d: DayNum) => dayParts(d).day + " " + MONTH_SHORT[dayParts(d).month];
/** dall'8, all'11 */
export const elides = (d: DayNum) => [8, 11].includes(dayParts(d).day);
export const listIt = (a: string[]) => (a.length <= 1 ? a[0] ?? "" : a.slice(0, -1).join(", ") + " e " + a[a.length - 1]);
const q = (n: string) => "«" + n + "»";

export function daysLong(ds: readonly number[]): string {
    const s = [...ds].sort((a, b) => a - b), art = (i: number) => (i === 6 ? "la " : "il ");
    if (s.length === 1) return art(s[0]) + DAYS_L[s[0]];
    if (s.length >= 3 && s[s.length - 1] - s[0] === s.length - 1) return "dal " + DAYS_L[s[0]] + (s[s.length - 1] === 6 ? " alla " : " al ") + DAYS_L[s[s.length - 1]];
    return listIt(s.map(i => DAYS_L[i]));
}

export const thingName = (D: Pick<Draft, "kind" | "thing">, L: DraftLookups) =>
    !D.thing ? null : D.kind === "menu" ? L.catalogs.get(D.thing) ?? "Menù" : D.kind === "style" ? L.styles.get(D.thing) ?? "Stile" : L.featured.get(D.thing) ?? "Contenuto";
export const pairName = (D: Draft, L: DraftLookups) =>
    !D.pair ? null : D.kind === "menu" ? L.styles.get(D.pair) ?? "Stile" : L.catalogs.get(D.pair) ?? "Menù";

const productName = (id: string, L: DraftLookups) => L.products.get(id)?.name ?? "Prodotto";

export function whatLines(D: Draft, L: DraftLookups): string[] {
    if (D.kind === "price")
        return D.picks.map(id => {
            const p = L.products.get(id), n = productName(id, L);
            if (p && p.formats.length) {
                const fs = p.formats.map(f => f.name + " " + (D.prices[priceKey(id, f.id)] != null ? eur(D.prices[priceKey(id, f.id)]!) : "(manca il prezzo)"));
                return `${n} a ${listIt(fs)}`;
            }
            const v = D.prices[id];
            if (v == null) return n + " (manca il prezzo)";
            return D.strike && p?.listPrice != null ? `${n} scontato da ${eur(p.listPrice)} a ${eur(v)}` : `${n} a ${eur(v)}`;
        });
    if (D.kind === "visibility") return D.picks.map(id => productName(id, L) + (D.hide === "disable" ? " resta nel menù ma non si ordina" : " non si vede"));
    const n = thingName(D, L);
    if (!n) return [];
    if (D.kind === "menu") return [`${q(n)} prende il posto degli altri menù`];
    if (D.kind === "style") return [`la pagina prende lo stile ${q(n)}`];
    return [`${q(n)} va in evidenza`];
}

export function whereText(w: CalWhere, L: DraftLookups): string {
    if (w.all) return "Tutte le sedi";
    const gs = w.groupIds.map(g => "Gruppo «" + (L.groups.get(g) ?? "gruppo") + "»");
    const ss = w.activityIds.map(a => L.sedi.get(a) ?? "sede");
    return [...gs, ...ss].join(", ") || "da scegliere";
}
export function whereFor(w: CalWhere, L: DraftLookups): string {
    if (w.all) return "per tutte le sedi";
    if (w.groupIds.length && !w.activityIds.length) return "per " + listIt(w.groupIds.map(g => "il gruppo «" + (L.groups.get(g) ?? "gruppo") + "»"));
    const ss = w.activityIds.map(a => L.sedi.get(a) ?? "sede");
    return ss.length === 1 ? "solo per " + ss[0] : "per " + listIt(ss);
}

export function sentence(D: Draft, L: DraftLookups): string {
    const w = D.when;
    const p = [
        w.period
            ? (elides(w.period.from) ? "Dall'" : "Dal ") + mShort(w.period.from) + (elides(w.period.to) ? " all'" : " al ") + mShort(w.period.to)
            : w.days || w.ranges
              ? "Ogni settimana"
              : "Sempre"
    ];
    if (w.days) p.push(daysLong(w.days));
    if (w.ranges) p.push(listIt(w.ranges.map(([a, b]) => "dalle " + hhmm(a) + " alle " + hhmm(b))));
    if (L.multi) p.push(whereFor(D.where, L));
    return p.join(", ") + ": " + (listIt(whatLines(D, L)) || "…") + ".";
}

/** Il nome breve di quello che si modifica: i primi due piatti, o la cosa scelta. */
export function draftLabel(D: Draft, L: DraftLookups): string {
    if (isDish(D.kind)) {
        const ns = D.picks.map(id => productName(id, L));
        return (ns.length <= 2 ? ns.join(", ") : ns.slice(0, 2).join(", ") + " +" + (ns.length - 2)) || "nessun piatto";
    }
    return thingName(D, L) ?? "da scegliere";
}

export const autoName = (D: Draft, L: DraftLookups) => (isDish(D.kind) ? KIND_LABEL[D.kind] : thingName(D, L) ?? KIND_LABEL[D.kind]) + " · " + durLabel(D.when);

export const hoursText = (m: number) => {
    const h = Math.floor(m / 60), mm = m % 60;
    return (h ? h + (h === 1 ? " ora" : " ore") : "") + (mm ? (h ? " e " : "") + mm + " minuti" : "") || "0 ore";
};

/** Le fasce in ordine, unite dove si toccano. */
export function normRanges(rs: [number, number][]) {
    rs.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < rs.length - 1; i++) {
        if (rs[i + 1][0] <= rs[i][1]) {
            rs[i][1] = Math.max(rs[i][1], rs[i + 1][1]);
            rs.splice(i + 1, 1);
            i--;
        }
    }
}

/* ---------- dal database di oggi ---------- */

export const isoDay = (d: DayNum) => {
    const p = dayParts(d);
    return p.year + "-" + String(p.month + 1).padStart(2, "0") + "-" + String(p.day).padStart(2, "0");
};
const hm = (m: number) => (m >= 1440 ? "23:59" : hhmm(m));

/** I campi del tempo come li scrive l'editor della regola. */
export function timeFields(w: CalWhen) {
    const window = !!(w.period || w.days || w.ranges);
    const r = w.ranges?.[0] ?? null;
    return {
        timeMode: (window ? "window" : "always") as "window" | "always",
        // 0 = domenica nel database, 0 = lunedì qui
        daysOfWeek: w.days ? w.days.map(d => (d + 1) % 7) : null,
        timeFrom: r ? hhmm(r[0]) : null,
        timeTo: r ? hm(r[1]) : null,
        startDay: w.period ? isoDay(w.period.from) : "",
        endDay: w.period ? isoDay(w.period.to) : "",
        alwaysActive: !w.days && !w.ranges
    };
}

/* ---------- l'anteprima: la bozza come voce del calendario ---------- */

export const cloneDraft = (D: Draft): Draft => ({ ...D, picks: [...D.picks], prices: { ...D.prices }, when: cloneWhen(D.when), where: cloneWhere(D.where) });

/** La voce col bordo tratteggiato nel calendario; null finché non c'è niente da far vedere. */
export function draftEntry(D: Draft, L: DraftLookups, now: number): CalEntry | null {
    // per i piatti la linea dell'anteprima porta i loro nomi, come nella v10
    const thing = isDish(D.kind) ? (D.picks.length ? D.name?.trim() || D.picks.map(id => L.products.get(id)?.name ?? id).join(", ") : null) : thingName(D, L);
    if (!thing) return null;
    const w = D.when;
    return {
        id: "draft:" + D.kind,
        ruleId: D.rule?.id ?? "draft",
        kind: D.kind,
        thing,
        where: cloneWhere(D.where),
        when: cloneWhen(w),
        tscore: (w.period ? 4 : 0) + (w.ranges ? 2 : 0) + (w.days ? 1 : 0),
        priority: D.rule?.priority ?? 21,
        created: D.rule ? Date.parse(D.rule.created_at) || now : now,
        add: !(D.kind === "menu" || D.kind === "style"),
        rule: D.rule as LayoutRule,
        preview: true
    };
}
