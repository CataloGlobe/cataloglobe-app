import {
    getPageViewsTrend,
    getTopViewedProducts,
    getTopSelectedProducts,
    getOverviewStats,
    getSocialClicks,
    getReviewMetrics,
    getHourlyDistribution,
    getDeviceDistribution,
    getTopSearchTerms,
    getConversionFunnel,
    getFeaturedPerformance,
    getOrdersOverview,
    getOrdersTrend,
    getOrdersHourly,
    getTopOrderedProducts,
    getOrdersLatency,
    getOrdersConversion,
    getReservationsOverview,
    getReservationsTrend,
    getReservationsHourly,
    type TrendDataPoint,
    type TopProduct,
    type OverviewStats,
    type SocialClickData,
    type ReviewMetrics,
    type HourlyData,
    type DeviceData,
    type SearchTermData,
    type FunnelStep,
    type FeaturedPerformanceData,
    type OrdersOverview,
    type OrdersTrendPoint,
    type OrdersHourlyPoint,
    type TopOrderedProduct,
    type OrdersLatency,
    type OrdersConversion,
    type ReservationsOverview,
    type ReservationsTrendPoint,
    type ReservationsHourlyPoint
} from "@/services/supabase/analytics";
import { getPreviousRange, periodToDateRange, type PeriodKey } from "./periodComparison";

/** Quello che il piano accende: senza, la famiglia di RPC non parte. */
export interface AndamentoFeatures {
    orders: boolean;
    reservations: boolean;
}

/** I numeri di Andamento per un periodo e un livello (azienda o sede). */
export interface AndamentoData {
    overview: OverviewStats | null;
    previousOverview: OverviewStats | null;
    viewsTrend: TrendDataPoint[];
    /** Le visite del periodo prima, giorno per giorno: la linea tratteggiata. */
    previousViewsTrend: TrendDataPoint[];
    topViewed: TopProduct[];
    topSelected: TopProduct[];
    social: SocialClickData[];
    reviews: ReviewMetrics | null;
    hourly: HourlyData[];
    devices: DeviceData[];
    searchTerms: SearchTermData[];
    funnel: FunnelStep[];
    featured: FeaturedPerformanceData[];
    orders: {
        overview: OrdersOverview | null;
        previous: OrdersOverview | null;
        trend: OrdersTrendPoint[];
        hourly: OrdersHourlyPoint[];
        topByQuantity: TopOrderedProduct[];
        topByRevenue: TopOrderedProduct[];
        latency: OrdersLatency | null;
        conversion: OrdersConversion | null;
    } | null;
    reservations: {
        overview: ReservationsOverview | null;
        previous: ReservationsOverview | null;
        trend: ReservationsTrendPoint[];
        hourly: ReservationsHourlyPoint[];
    } | null;
}

/**
 * Un solo giro: le tre famiglie di RPC sono indipendenti (prima erano tre
 * cascate, il tempo era la loro somma). Su «Sempre» niente periodo prima.
 */
export async function loadAndamento(
    tenantId: string,
    period: PeriodKey,
    activityId: string | undefined,
    features: AndamentoFeatures
): Promise<AndamentoData> {
    const range = periodToDateRange(period);
    const compare = period !== "all";
    const previous = getPreviousRange(range);

    const [engagement, orders, reservations] = await Promise.all([
        Promise.all([
            getOverviewStats(tenantId, range, activityId),
            getPageViewsTrend(tenantId, range, activityId),
            getTopViewedProducts(tenantId, range, activityId),
            getTopSelectedProducts(tenantId, range, activityId),
            getSocialClicks(tenantId, range, activityId),
            getReviewMetrics(tenantId, range, activityId),
            getHourlyDistribution(tenantId, range, activityId),
            getDeviceDistribution(tenantId, range, activityId),
            getTopSearchTerms(tenantId, range, activityId),
            getConversionFunnel(tenantId, range, activityId),
            getFeaturedPerformance(tenantId, range, activityId),
            compare ? getOverviewStats(tenantId, previous, activityId) : Promise.resolve(null),
            compare ? getPageViewsTrend(tenantId, previous, activityId) : Promise.resolve([])
        ] as const),
        features.orders
            ? Promise.all([
                  getOrdersOverview(tenantId, range, activityId),
                  getOrdersTrend(tenantId, range, activityId),
                  getOrdersHourly(tenantId, range, activityId),
                  getTopOrderedProducts(tenantId, range, "quantity", activityId),
                  getTopOrderedProducts(tenantId, range, "revenue", activityId),
                  getOrdersLatency(tenantId, range, activityId),
                  getOrdersConversion(tenantId, range, activityId),
                  compare ? getOrdersOverview(tenantId, previous, activityId) : Promise.resolve(null)
              ] as const)
            : Promise.resolve(null),
        // Base periodo = created_at ("prenotazioni ricevute nel periodo").
        features.reservations
            ? Promise.all([
                  getReservationsOverview(tenantId, range, activityId),
                  getReservationsTrend(tenantId, range, activityId),
                  getReservationsHourly(tenantId, range, activityId),
                  compare ? getReservationsOverview(tenantId, previous, activityId) : Promise.resolve(null)
              ] as const)
            : Promise.resolve(null)
    ]);

    const [overview, viewsTrend, topViewed, topSelected, social, reviews, hourly, devices, searchTerms, funnel, featured, previousOverview, previousViewsTrend] =
        engagement;
    return {
        overview,
        previousOverview,
        viewsTrend,
        previousViewsTrend,
        topViewed,
        topSelected,
        social,
        reviews,
        hourly,
        devices,
        searchTerms,
        funnel,
        featured,
        orders: orders
            ? {
                  overview: orders[0],
                  trend: orders[1],
                  hourly: orders[2],
                  topByQuantity: orders[3],
                  topByRevenue: orders[4],
                  latency: orders[5],
                  conversion: orders[6],
                  previous: orders[7]
              }
            : null,
        reservations: reservations
            ? { overview: reservations[0], trend: reservations[1], hourly: reservations[2], previous: reservations[3] }
            : null
    };
}

/** I numeri di una sede messa a confronto: solo quelli che le righe confrontano. */
export interface SedeNumbers {
    visits: number;
    previousVisits: number | null;
    viewsTrend: TrendDataPoint[];
    orders: number;
    previousOrders: number | null;
    revenue: number;
    previousRevenue: number | null;
    ordersTrend: OrdersTrendPoint[];
    covers: number;
    previousCovers: number | null;
    reservationsTrend: ReservationsTrendPoint[];
    rating: number | null;
    reviews: number;
}

export function sedeNumbersOf(data: AndamentoData): SedeNumbers {
    return {
        visits: data.overview?.total_views ?? 0,
        previousVisits: data.previousOverview?.total_views ?? null,
        viewsTrend: data.viewsTrend,
        orders: data.orders?.overview?.orders_count ?? 0,
        previousOrders: data.orders?.previous?.orders_count ?? null,
        revenue: data.orders?.overview?.revenue ?? 0,
        previousRevenue: data.orders?.previous?.revenue ?? null,
        ordersTrend: data.orders?.trend ?? [],
        covers: data.reservations?.overview?.covers ?? 0,
        previousCovers: data.reservations?.previous?.covers ?? null,
        reservationsTrend: data.reservations?.trend ?? [],
        rating: data.reviews && data.reviews.total > 0 ? data.reviews.avg_rating : null,
        reviews: data.reviews?.total ?? 0
    };
}

/**
 * Le sedi a confronto (D152): per ognuna i totali, il periodo prima e le
 * serie giornaliere. Una RPC che le dia tutte insieme farebbe lo stesso con
 * una chiamata sola (da dire a Lorenzo).
 */
export async function loadSedeNumbers(
    tenantId: string,
    period: PeriodKey,
    activityId: string,
    features: AndamentoFeatures
): Promise<SedeNumbers> {
    const range = periodToDateRange(period);
    const compare = period !== "all";
    const previous = getPreviousRange(range);
    const none = Promise.resolve(null);

    const [overview, previousOverview, viewsTrend, reviews, orders, previousOrders, ordersTrend, reservations, previousReservations, reservationsTrend] =
        await Promise.all([
            getOverviewStats(tenantId, range, activityId),
            compare ? getOverviewStats(tenantId, previous, activityId) : none,
            getPageViewsTrend(tenantId, range, activityId),
            getReviewMetrics(tenantId, range, activityId),
            features.orders ? getOrdersOverview(tenantId, range, activityId) : none,
            features.orders && compare ? getOrdersOverview(tenantId, previous, activityId) : none,
            features.orders ? getOrdersTrend(tenantId, range, activityId) : Promise.resolve([]),
            features.reservations ? getReservationsOverview(tenantId, range, activityId) : none,
            features.reservations && compare ? getReservationsOverview(tenantId, previous, activityId) : none,
            features.reservations ? getReservationsTrend(tenantId, range, activityId) : Promise.resolve([])
        ] as const);

    return {
        visits: overview?.total_views ?? 0,
        previousVisits: previousOverview?.total_views ?? null,
        viewsTrend,
        orders: orders?.orders_count ?? 0,
        previousOrders: previousOrders?.orders_count ?? null,
        revenue: orders?.revenue ?? 0,
        previousRevenue: previousOrders?.revenue ?? null,
        ordersTrend,
        covers: reservations?.covers ?? 0,
        previousCovers: previousReservations?.covers ?? null,
        reservationsTrend,
        rating: reviews && reviews.total > 0 ? reviews.avg_rating : null,
        reviews: reviews?.total ?? 0
    };
}
