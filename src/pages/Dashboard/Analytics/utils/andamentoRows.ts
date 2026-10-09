import { formatPrice } from "@/utils/formatCurrency";
import type { AndamentoData, SedeNumbers } from "./andamentoData";
import { calculateDelta, isBelowSample, type PeriodKey } from "./periodComparison";

/**
 * Andamento B (D154): una riga per cosa, sempre nello stesso ordine, e una
 * frase in cima che risponde «come va». Puro: niente rete, niente DOM.
 */

export type RowKey = "pagina" | "tavolo" | "prenotazioni" | "recensioni" | "ricerche";

/** Un pezzo della risposta: i numeri in grassetto. */
export type AnswerPart = { text: string; strong?: boolean };

export interface AndamentoRow {
    key: RowKey;
    title: string;
    answer: AnswerPart[];
    /** Sul periodo prima, in %; null quando non si confronta (pochi dati, «Sempre»). */
    delta: number | null;
    /** Le due righe piccole a destra. */
    extras: string[];
    /** Senza dati nel periodo: la riga scende in fondo, in grigio, col perché. */
    empty: { text: string; action?: { label: string; to: string } } | null;
}

/** Dove si è e cosa c'è acceso: serve alle righe vuote per dire il perché. */
export interface RowsContext {
    period: PeriodKey;
    ordersFeature: boolean;
    reservationsFeature: boolean;
    sedeCount: number;
    orderingOn: number;
    reservationsOn: number;
    paths: { sedi: string; prenotazioni: string };
}

const int = (n: number) => Math.round(n).toLocaleString("it-IT");
const one = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const plural = (n: number, s: string, p: string) => `${int(n)} ${n === 1 ? s : p}`;

/** «in 30 giorni», «oggi»: per le righe vuote. */
export const PERIOD_IN: Record<PeriodKey, string> = {
    today: "oggi",
    "7d": "in 7 giorni",
    "30d": "in 30 giorni",
    "90d": "in 90 giorni",
    all: "finora"
};

const PERIOD_LEAD: Record<PeriodKey, string> = {
    today: "Oggi",
    "7d": "Ultimi 7 giorni",
    "30d": "Ultimi 30 giorni",
    "90d": "Ultimi 90 giorni",
    all: "Da sempre"
};

/** Il periodo prima, nelle tre forme della frase. */
const PREVIOUS: Record<Exclude<PeriodKey, "all">, { of: string; as: string; on: string }> = {
    today: { of: "di ieri", as: "ieri", on: "su ieri" },
    "7d": { of: "della settimana prima", as: "la settimana prima", on: "sulla settimana prima" },
    "30d": { of: "del mese prima", as: "il mese prima", on: "sul mese prima" },
    "90d": { of: "dei tre mesi prima", as: "i tre mesi prima", on: "sui tre mesi prima" }
};

/** «+12%», «−4%», «uguale». */
export function formatDelta(delta: number): string {
    const r = Math.round(delta);
    if (r === 0) return "uguale";
    return `${r > 0 ? "+" : "−"}${Math.abs(r)}%`;
}

export function formatRating(rating: number): string {
    return `${one(rating)} ★`;
}

/** Il confronto delle visite vale solo sopra il campione (§36.1/3). */
export function visitsDelta(visits: number, previous: number | null): number | null {
    if (previous === null || isBelowSample(visits)) return null;
    return calculateDelta(visits, previous);
}

const countDelta = (current: number, previous: number | null) =>
    previous === null ? null : calculateDelta(current, previous);

/** «2 su 10», o «6 su 100» quando sono pochi. */
function share(pct: number): string {
    return pct >= 10 ? `${Math.round(pct / 10)} su 10` : `${Math.round(pct)} su 100`;
}

const LOW_STARS = 3;

export function lowReviews(data: AndamentoData): number {
    return (data.reviews?.distribution ?? []).filter(d => d.stars <= LOW_STARS).reduce((sum, d) => sum + d.count, 0);
}

/** Le ricerche che non trovano niente nel menù. */
export function searchesNotFound(data: AndamentoData) {
    return data.searchTerms.filter(t => t.avg_results === 0);
}

export function buildRows(data: AndamentoData, ctx: RowsContext): AndamentoRow[] {
    const inPeriod = PERIOD_IN[ctx.period];
    const onOf = (on: number) =>
        ctx.sedeCount === 1
            ? "su questa sede"
            : on === ctx.sedeCount
              ? `su tutte le ${ctx.sedeCount} sedi`
              : `su ${on} ${on === 1 ? "sede" : "sedi"} su ${ctx.sedeCount}`;
    const rows: AndamentoRow[] = [];

    // La pagina pubblica.
    const visits = data.overview?.total_views ?? 0;
    const small = isBelowSample(visits);
    const lastStep = data.funnel.length > 0 ? data.funnel[data.funnel.length - 1] : null;
    const mobile = data.devices.find(d => d.device_type === "mobile");
    rows.push({
        key: "pagina",
        title: "La pagina",
        answer: [{ text: int(visits), strong: true }, { text: visits === 1 ? " visita" : " visite" }],
        delta: visitsDelta(visits, data.previousOverview?.total_views ?? null),
        extras: [
            lastStep ? (small ? `${int(lastStep.session_count)} con una scelta` : `${share(lastStep.percentage)} scelgono qualcosa`) : null,
            mobile ? (small ? `${int(mobile.device_count)} dal telefono` : `${Math.round(mobile.percentage)}% dal telefono`) : null
        ].filter((x): x is string => x !== null),
        empty: visits === 0 ? { text: `Nessuna visita alla pagina ${inPeriod}.` } : null
    });

    // Al tavolo.
    if (ctx.ordersFeature) {
        const o = data.orders?.overview;
        const count = o?.orders_count ?? 0;
        rows.push({
            key: "tavolo",
            title: "Al tavolo",
            answer: [
                { text: int(count), strong: true },
                { text: count === 1 ? " ordine per " : " ordini per " },
                { text: formatPrice(o?.revenue ?? 0), strong: true }
            ],
            delta: countDelta(o?.revenue ?? 0, data.orders?.previous?.revenue ?? null),
            extras: o ? [`${formatPrice(o.avg_order_value)} a ordine`, `${Math.round(o.cancellation_rate)}% annullati`] : [],
            empty:
                count === 0
                    ? {
                          text:
                              ctx.orderingOn === 0
                                  ? `Nessun ordine ${inPeriod}: il canale è spento su tutte le sedi.`
                                  : `Nessun ordine ${inPeriod}, con il canale acceso ${onOf(ctx.orderingOn)}.`,
                          action: { label: "Vai alle sedi", to: ctx.paths.sedi }
                      }
                    : null
        });
    }

    // Prenotazioni.
    if (ctx.reservationsFeature) {
        const r = data.reservations?.overview;
        const count = r?.reservations_count ?? 0;
        rows.push({
            key: "prenotazioni",
            title: "Prenotazioni",
            answer: [
                { text: int(r?.covers ?? 0), strong: true },
                { text: ` coperti in ${plural(count, "prenotazione", "prenotazioni")}` }
            ],
            delta: countDelta(r?.covers ?? 0, data.reservations?.previous?.covers ?? null),
            extras: r ? [plural(r.confirmed_count, "confermata", "confermate"), `${int(r.online_count)} online · ${int(r.manual_count)} a mano`] : [],
            empty:
                count === 0
                    ? {
                          text:
                              ctx.reservationsOn === 0
                                  ? `Nessuna prenotazione ${inPeriod}: le prenotazioni sono spente su tutte le sedi.`
                                  : `Nessuna prenotazione ${inPeriod}, con le prenotazioni accese ${onOf(ctx.reservationsOn)}.`,
                          action: { label: "Apri Prenotazioni", to: ctx.paths.prenotazioni }
                      }
                    : null
        });
    }

    // Recensioni.
    const reviews = data.reviews?.total ?? 0;
    const low = lowReviews(data);
    rows.push({
        key: "recensioni",
        title: "Recensioni",
        answer: [
            { text: reviews > 0 ? formatRating(data.reviews?.avg_rating ?? 0) : "—", strong: true },
            { text: ` su ${plural(reviews, "recensione", "recensioni")}` }
        ],
        delta: null,
        extras: [
            low > 0 ? `${int(low)} ${low === 1 ? "bassa" : "basse"} da leggere` : "nessuna bassa",
            `${int(data.reviews?.google_redirects ?? 0)} passate su Google`
        ],
        empty: reviews === 0 ? { text: `Nessuna recensione ${inPeriod}.` } : null
    });

    // Cosa cercano.
    const notFound = searchesNotFound(data);
    const searches = data.searchTerms.reduce((sum, t) => sum + t.search_count, 0);
    const top = [...data.searchTerms].sort((a, b) => b.search_count - a.search_count).slice(0, 2);
    rows.push({
        key: "ricerche",
        title: "Cosa cercano",
        answer:
            notFound.length > 0
                ? [
                      { text: plural(notFound.length, "ricerca", "ricerche"), strong: true },
                      { text: notFound.length === 1 ? " non trova niente" : " non trovano niente" }
                  ]
                : [{ text: int(searches), strong: true }, { text: searches === 1 ? " ricerca, tutte trovano qualcosa" : " ricerche, tutte trovano qualcosa" }],
        delta: null,
        extras: top.map(t => `«${t.search_term}» ${t.search_count === 1 ? "una volta" : `${int(t.search_count)} volte`}`),
        empty: data.searchTerms.length === 0 ? { text: `Nessuna ricerca nel menù ${inPeriod}.` } : null
    });

    // Ordine fisso; le righe senza dati scendono in fondo (§36.3).
    return [...rows.filter(r => !r.empty), ...rows.filter(r => r.empty)];
}

/** La riga «In evidenza», sotto le altre: il più aperto e chi non è aperto. */
export function featuredLine(data: AndamentoData, period: PeriodKey): string {
    const sorted = [...data.featured].sort((a, b) => b.click_count - a.click_count);
    if (sorted.length === 0) return `Nessun contenuto in evidenza aperto ${PERIOD_IN[period]}.`;
    const first = sorted[0];
    const times = first.click_count === 1 ? "una volta" : `${int(first.click_count)} volte`;
    const others = sorted.length - 1;
    return `«${first.title}» aperto ${times}${others > 0 ? `, e ${plural(others, "altro", "altri")}` : ""}.`;
}

export interface Sentence {
    lead: string;
    detail: string;
}

/** La frase in cima: come va rispetto al periodo prima, e i numeri in una riga. */
export function andamentoSentence(data: AndamentoData, ctx: Pick<RowsContext, "period" | "ordersFeature" | "reservationsFeature">): Sentence {
    const visits = data.overview?.total_views ?? 0;
    const orders = data.orders?.overview;
    const res = data.reservations?.overview;
    const reviews = data.reviews?.total ?? 0;

    const vDelta = visitsDelta(visits, data.previousOverview?.total_views ?? null);
    const rDelta = orders ? countDelta(orders.revenue, data.orders?.previous?.revenue ?? null) : null;
    const cDelta = res ? countDelta(res.covers, data.reservations?.previous?.covers ?? null) : null;
    const withDelta = (text: string, d: number | null) =>
        d === null ? text : `${text} (${Math.round(d) === 0 ? "come prima" : formatDelta(d)})`;

    const parts = [
        visits > 0 ? withDelta(`${plural(visits, "visita", "visite")} alla pagina`, vDelta) : null,
        ctx.ordersFeature && orders && orders.orders_count > 0
            ? withDelta(`${plural(orders.orders_count, "ordine", "ordini")} al tavolo per ${formatPrice(orders.revenue)}`, rDelta)
            : null,
        ctx.reservationsFeature && res && res.covers > 0 ? withDelta(`${plural(res.covers, "coperto prenotato", "coperti prenotati")}`, cDelta) : null,
        reviews > 0 ? `voto ${one(data.reviews?.avg_rating ?? 0)} su ${plural(reviews, "recensione", "recensioni")}` : null
    ].filter((x): x is string => x !== null);

    const head = PERIOD_LEAD[ctx.period];
    if (parts.length === 0) {
        return { lead: `${head}: ancora nessun dato.`, detail: "I numeri arrivano quando la pagina pubblica gira: il link o il QR sui tavoli." };
    }
    if (ctx.period === "all") return { lead: "Da sempre, tutto insieme.", detail: parts.join(" · ") };

    // Il giudizio: quanti numeri salgono e quanti scendono, oltre il 3%.
    const deltas = [vDelta, rDelta, cDelta].filter((d): d is number => d !== null && Math.abs(d) >= 3);
    const score = deltas.reduce((sum, d) => sum + Math.sign(d), 0);
    const prev = PREVIOUS[ctx.period];
    const lead =
        [vDelta, rDelta, cDelta].every(d => d === null)
            ? `${head}: ancora pochi dati per un confronto.`
            : score > 0
              ? `${head}: va meglio ${prev.of}.`
              : score < 0
                ? `${head}: va peggio ${prev.of}.`
                : `${head}: più o meno come ${prev.as}.`;
    return { lead, detail: parts.join(" · ") };
}

/** Una sede a confronto: il nome e i suoi numeri. */
export interface SedeCompared {
    id: string;
    name: string;
    numbers: SedeNumbers;
}

/** Il valore di una riga per una sede: la barra, il numero, il confronto. */
export function compareValue(key: RowKey, n: SedeNumbers): { value: number; label: string; delta: number | null } | null {
    switch (key) {
        case "pagina":
            return { value: n.visits, label: int(n.visits), delta: visitsDelta(n.visits, n.previousVisits) };
        case "tavolo":
            return { value: n.revenue, label: formatPrice(n.revenue), delta: countDelta(n.revenue, n.previousRevenue) };
        case "prenotazioni":
            return { value: n.covers, label: int(n.covers), delta: countDelta(n.covers, n.previousCovers) };
        case "recensioni":
            return n.rating === null ? { value: 0, label: "—", delta: null } : { value: n.rating, label: formatRating(n.rating), delta: null };
        case "ricerche":
            return null;
    }
}

/** La frase in cima col confronto: chi va meglio, e come va ognuna. */
export function compareSentence(sedi: readonly SedeCompared[], period: PeriodKey): Sentence {
    const byVisits = [...sedi].sort((a, b) => b.numbers.visits - a.numbers.visits);
    const top = byVisits[0];
    const topOrders = [...sedi].sort((a, b) => b.numbers.revenue - a.numbers.revenue)[0];
    const others = sedi.length - 1;
    const lead =
        top.numbers.visits === 0
            ? `${PERIOD_LEAD[period]}: ancora nessuna visita da confrontare.`
            : `${top.name} ha più visite ${others === 1 ? "dell'altra" : "delle altre"}${topOrders.id === top.id && top.numbers.revenue > 0 ? " e incassa di più al tavolo" : ""}.`;
    const detail = byVisits
        .map(s => {
            const d = visitsDelta(s.numbers.visits, s.numbers.previousVisits);
            return `${s.name} ${plural(s.numbers.visits, "visita", "visite")}${d === null ? "" : ` (${formatDelta(d)})`}`;
        })
        .join(" · ");
    return { lead, detail: period === "all" ? detail : `${detail}, ${PREVIOUS[period].on}` };
}
