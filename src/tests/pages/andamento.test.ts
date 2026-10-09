import { describe, expect, it } from "vitest";
import type { AndamentoData, SedeNumbers } from "@/pages/Dashboard/Analytics/utils/andamentoData";
import {
    andamentoSentence,
    buildRows,
    compareSentence,
    featuredLine,
    formatDelta,
    type RowsContext
} from "@/pages/Dashboard/Analytics/utils/andamentoRows";
import { alignDaily } from "@/pages/Dashboard/Analytics/utils/andamentoSeries";
import { periodToDateRange } from "@/pages/Dashboard/Analytics/utils/periodComparison";

function makeData(over: Partial<AndamentoData> = {}): AndamentoData {
    return {
        overview: { total_views: 151, unique_sessions: 146, avg_events_per_session: 2.4 },
        previousOverview: { total_views: 120, unique_sessions: 110, avg_events_per_session: 2 },
        viewsTrend: [],
        previousViewsTrend: [],
        topViewed: [],
        topSelected: [],
        social: [],
        reviews: {
            total: 4,
            avg_rating: 3.5,
            google_redirects: 1,
            distribution: [
                { stars: 5, count: 2 },
                { stars: 2, count: 1 },
                { stars: 1, count: 1 }
            ]
        },
        hourly: [],
        devices: [{ device_type: "mobile", device_count: 120, percentage: 80 }],
        searchTerms: [
            { search_term: "tiramisù", search_count: 2, avg_results: 4 },
            { search_term: "senza glutine", search_count: 1, avg_results: 0 }
        ],
        funnel: [{ step_name: "selection_add", step_label: "Aggiunti", session_count: 9, percentage: 6 }],
        featured: [],
        orders: {
            overview: { orders_count: 12, revenue: 240, avg_order_value: 20, cancellation_rate: 8.3, cancelled_count: 1 },
            previous: { orders_count: 10, revenue: 200, avg_order_value: 20, cancellation_rate: 0, cancelled_count: 0 },
            trend: [],
            hourly: [],
            topByQuantity: [],
            topByRevenue: [],
            latency: null,
            conversion: null
        },
        reservations: {
            overview: {
                reservations_count: 0,
                covers: 0,
                confirmed_count: 0,
                confirm_rate: 0,
                declined_count: 0,
                cancelled_count: 0,
                online_count: 0,
                manual_count: 0
            },
            previous: null,
            trend: [],
            hourly: []
        },
        ...over
    };
}

const ctx: RowsContext = {
    period: "30d",
    ordersFeature: true,
    reservationsFeature: true,
    sedeCount: 2,
    orderingOn: 2,
    reservationsOn: 1,
    paths: { sedi: "/sedi", prenotazioni: "/prenotazioni" }
};

describe("Andamento: le righe", () => {
    it("stanno nell'ordine fisso, quelle senza dati in fondo col perché", () => {
        const rows = buildRows(makeData(), ctx);
        expect(rows.map(r => r.key)).toEqual(["pagina", "tavolo", "recensioni", "ricerche", "prenotazioni"]);
        const empty = rows[4];
        expect(empty.empty?.text).toBe("Nessuna prenotazione in 30 giorni, con le prenotazioni accese su 1 sede su 2.");
        expect(empty.empty?.action).toEqual({ label: "Apri Prenotazioni", to: "/prenotazioni" });
    });

    it("la pagina: il confronto e le percentuali solo sopra le 100 visite", () => {
        const [pagina] = buildRows(makeData(), ctx);
        expect(Math.round(pagina.delta ?? 0)).toBe(26);
        expect(pagina.extras).toEqual(["6 su 100 scelgono qualcosa", "80% dal telefono"]);

        const small = buildRows(makeData({ overview: { total_views: 42, unique_sessions: 40, avg_events_per_session: 2 } }), ctx)[0];
        expect(small.delta).toBeNull();
        expect(small.extras).toEqual(["9 con una scelta", "120 dal telefono"]);
    });

    it("cosa cercano: conta quelle che non trovano niente", () => {
        const row = buildRows(makeData(), ctx).find(r => r.key === "ricerche");
        expect(row?.answer.map(p => p.text).join("")).toBe("1 ricerca non trova niente");
        expect(row?.extras).toEqual(["«tiramisù» 2 volte", "«senza glutine» una volta"]);
    });

    it("senza il piano degli ordini la riga del tavolo non c'è", () => {
        const rows = buildRows(makeData({ orders: null }), { ...ctx, ordersFeature: false });
        expect(rows.some(r => r.key === "tavolo")).toBe(false);
    });
});

describe("Andamento: la frase in cima", () => {
    it("dice se va meglio del periodo prima, e i numeri in una riga", () => {
        const s = andamentoSentence(makeData(), ctx);
        expect(s.lead).toBe("Ultimi 30 giorni: va meglio del mese prima.");
        expect(s.detail).toBe("151 visite alla pagina (+26%) · 12 ordini al tavolo per 240,00 € (+20%) · voto 3,5 su 4 recensioni");
    });

    it("su «Sempre» non giudica, e senza dati lo dice", () => {
        expect(andamentoSentence(makeData(), { ...ctx, period: "all" }).lead).toBe("Da sempre, tutto insieme.");
        const none = makeData({ overview: null, reviews: null, orders: null, reservations: null });
        expect(andamentoSentence(none, ctx).lead).toBe("Ultimi 30 giorni: ancora nessun dato.");
    });

    it("col confronto: chi ha più visite, e come va ognuna", () => {
        // I numeri di una sede: qui li scrive il test (sedeNumbersOf legge le RPC).
        const own: SedeNumbers = {
            visits: 151,
            previousVisits: 120,
            viewsTrend: [],
            orders: 12,
            previousOrders: 10,
            revenue: 240,
            previousRevenue: 200,
            ordersTrend: [],
            covers: 0,
            previousCovers: null,
            reservationsTrend: [],
            rating: 3.5,
            reviews: 4
        };
        const other = { ...own, visits: 300, previousVisits: 290, revenue: 100 };
        const s = compareSentence(
            [
                { id: "a", name: "Centro", numbers: own },
                { id: "b", name: "Porto", numbers: other }
            ],
            "30d"
        );
        expect(s.lead).toBe("Porto ha più visite dell'altra.");
        expect(s.detail).toBe("Porto 300 visite (+3%) · Centro 151 visite (+26%), sul mese prima");
    });

    it("i delta: segno vero e «uguale»", () => {
        expect(formatDelta(-4.2)).toBe("−4%");
        expect(formatDelta(0.3)).toBe("uguale");
    });

    it("in evidenza: il più aperto, e quanti altri", () => {
        const data = makeData({
            featured: [
                { title: "Menù d'estate", slot: "before_catalog", click_count: 5 },
                { title: "Aperitivo", slot: "after_catalog", click_count: 9 }
            ]
        });
        expect(featuredLine(data, "30d")).toBe("«Aperitivo» aperto 9 volte, e 1 altro.");
        expect(featuredLine(makeData(), "7d")).toBe("Nessun contenuto in evidenza aperto in 7 giorni.");
    });
});

describe("Andamento: le serie", () => {
    it("su «Sempre» due sedi stanno sugli stessi giorni", () => {
        const range = periodToDateRange("all");
        const { dates, values } = alignDaily(
            [
                [{ date: "2026-09-01", value: 3 }],
                [{ date: "2026-09-03", value: 5 }]
            ],
            range,
            "all"
        );
        expect(dates).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
        expect(values).toEqual([
            [3, 0, 0],
            [0, 0, 5]
        ]);
    });
});
