import type { Page } from "@playwright/test";
import { TENANT_ID } from "./reservationsStub";
import { stubRest, type RestStub } from "./restStub";
import { freezeClock } from "./appearanceStub";

/**
 * Dati finti per l'e2e di Analitiche (lotto `ds-5-coda`, P0).
 *
 * Le 21 RPC `analytics_*` rispondono da qui (ogni chiamata è registrata in
 * `calls`, con i parametri); permessi, piano, azienda e sidebar restano veri.
 * Orologio fermo a mercoledì 23/09/2026 12:00 di Roma.
 *
 * Due campioni: `full` (151 visite, sopra la soglia dei 100; 12 ordini;
 * nessuna prenotazione) e `small` (42 visite, sotto soglia).
 */

export { TENANT_ID };

export type AnalyticsCall = { fn: string; body: Record<string, unknown> };

const days = (n: number, value: (i: number) => number) =>
    Array.from({ length: n }, (_, i) => {
        const d = new Date(Date.UTC(2026, 7, 25 + i));
        return { date: d.toISOString().slice(0, 10), count: value(i) };
    });

export function makeRpc(sample: "full" | "small"): Record<string, (body: unknown) => unknown> {
    const views = sample === "full" ? 151 : 42;
    return {
        analytics_overview_stats: () => [{ total_views: views, unique_sessions: views - 5, avg_events_per_session: 2.4 }],
        analytics_page_views_trend: () => days(30, i => (i % 7 === 3 ? 12 : 4)),
        analytics_top_viewed_products: () => [
            { product_name: "Focaccia e2e", count: 9 },
            { product_name: "Pane di segale e2e", count: 4 }
        ],
        analytics_top_selected_products: () => [{ product_name: "Focaccia e2e", count: 3 }],
        analytics_social_clicks: () => [
            { social_type: "instagram", click_count: 3 },
            { social_type: "facebook", click_count: 1 }
        ],
        analytics_review_metrics: () => ({
            total: 4,
            avg_rating: 3.5,
            google_redirects: 1,
            distribution: [
                { stars: 5, count: 2 },
                { stars: 4, count: 0 },
                { stars: 3, count: 0 },
                { stars: 2, count: 1 },
                { stars: 1, count: 1 }
            ]
        }),
        analytics_hourly_distribution: () => [
            { hour: 12, view_count: 40 },
            { hour: 13, view_count: 55 },
            { hour: 20, view_count: 30 }
        ],
        analytics_device_distribution: () => [
            { device_type: "mobile", device_count: 120, percentage: 80 },
            { device_type: "desktop", device_count: 31, percentage: 20 }
        ],
        analytics_top_search_terms: () => [
            { search_term: "tiramisù", search_count: 2, avg_results: 4 },
            { search_term: "senza glutine", search_count: 1, avg_results: 0 }
        ],
        analytics_conversion_funnel: () => [
            { step_name: "page_view", step_label: "Visite", session_count: views, percentage: 100 },
            { step_name: "product_detail_open", step_label: "Dettaglio prodotto", session_count: 30, percentage: 19.9 },
            { step_name: "selection_add", step_label: "Aggiunti alla selezione", session_count: 9, percentage: 6 }
        ],
        analytics_featured_performance: () => [{ title: "Menù d'estate e2e", slot: "before_catalog", click_count: 5 }],
        analytics_search_rate: () => [{ search_sessions: 3, total_sessions: views, rate: 2 }],
        analytics_orders_overview: () => [{ orders_count: 12, revenue: 240, avg_order_value: 20, cancellation_rate: 8.3, cancelled_count: 1 }],
        analytics_orders_trend: () =>
            days(30, i => (i % 5 === 0 ? 2 : 0)).map(d => ({ date: d.date, orders_count: d.count, revenue: d.count * 20 })),
        analytics_orders_hourly: () => [
            { hour: 13, orders_count: 7, revenue: 140 },
            { hour: 20, orders_count: 5, revenue: 100 }
        ],
        analytics_top_ordered_products: (body) =>
            (body as { p_order_by?: string })?.p_order_by === "revenue"
                ? [
                      { product_name: "Pizza e2e", quantity: 4, revenue: 48 },
                      { product_name: "Birra e2e", quantity: 9, revenue: 45 }
                  ]
                : [
                      { product_name: "Birra e2e", quantity: 9, revenue: 45 },
                      { product_name: "Pizza e2e", quantity: 4, revenue: 48 }
                  ],
        analytics_orders_latency: () => [
            {
                delivered_count: 11,
                skipped_ready_count: 2,
                avg_prep_seconds: 540,
                median_prep_seconds: 480,
                avg_delivery_seconds: 120,
                median_delivery_seconds: 90,
                avg_total_seconds: 660,
                median_total_seconds: 600
            }
        ],
        analytics_orders_conversion: () => [{ selection_sessions: 9, orders_count: 12, conversion_rate: 133.3 }],
        analytics_reservations_overview: () => [
            {
                reservations_count: 0,
                covers: 0,
                confirmed_count: 0,
                confirm_rate: 0,
                declined_count: 0,
                cancelled_count: 0,
                online_count: 0,
                manual_count: 0
            }
        ],
        analytics_reservations_trend: () => [],
        analytics_reservations_hourly: () => []
    };
}

export type AnaliticheStub = RestStub & { calls: AnalyticsCall[] };

export async function stubAnalitiche(page: Page, options: { sample?: "full" | "small" } = {}): Promise<AnaliticheStub> {
    const calls: AnalyticsCall[] = [];
    const rpc = Object.fromEntries(
        Object.entries(makeRpc(options.sample ?? "full")).map(([fn, serve]) => [
            fn,
            (body: unknown) => {
                calls.push({ fn, body: (body ?? {}) as Record<string, unknown> });
                return serve(body);
            }
        ])
    );
    const stub = await stubRest(page, { tables: {}, rpc });
    await freezeClock(page);
    return Object.assign(stub, { calls });
}
