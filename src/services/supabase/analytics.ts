import { supabase } from "@services/supabase/client";

// ── Types ────────────────────────────────────────────────────────────────

export type TrendDataPoint = {
    date: string;
    count: number;
};

export type TopProduct = {
    product_name: string;
    count: number;
};

export type OverviewStats = {
    total_views: number;
    unique_sessions: number;
    avg_events_per_session: number;
};

export type DateRange = {
    from: Date;
    to: Date;
};

export type SocialClickData = {
    social_type: string;
    click_count: number;
};

export type ReviewMetrics = {
    total: number;
    avg_rating: number;
    google_redirects: number;
    distribution: { stars: number; count: number }[];
};

export type SearchRateData = {
    search_sessions: number;
    total_sessions: number;
    rate: number;
};

export type HourlyData = {
    hour: number;
    view_count: number;
};

export type DeviceData = {
    device_type: string;
    device_count: number;
    percentage: number;
};

// ── Service functions ────────────────────────────────────────────────────

export async function getPageViewsTrend(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<TrendDataPoint[]> {
    const { data, error } = await supabase.rpc("analytics_page_views_trend", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null
    });

    if (error) throw error;
    return (data ?? []).map((row: { date: string; count: number }) => ({
        date: row.date,
        count: Number(row.count)
    }));
}

export async function getTopViewedProducts(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string,
    limit = 10
): Promise<TopProduct[]> {
    const { data, error } = await supabase.rpc("analytics_top_viewed_products", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null,
        p_limit: limit
    });

    if (error) throw error;
    return (data ?? []).map((row: { product_name: string; view_count: number }) => ({
        product_name: row.product_name,
        count: Number(row.view_count)
    }));
}

export async function getTopSelectedProducts(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string,
    limit = 10
): Promise<TopProduct[]> {
    const { data, error } = await supabase.rpc("analytics_top_selected_products", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null,
        p_limit: limit
    });

    if (error) throw error;
    return (data ?? []).map((row: { product_name: string; selection_count: number }) => ({
        product_name: row.product_name,
        count: Number(row.selection_count)
    }));
}

export async function getOverviewStats(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<OverviewStats> {
    const { data, error } = await supabase.rpc("analytics_overview_stats", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
        return { total_views: 0, unique_sessions: 0, avg_events_per_session: 0 };
    }

    return {
        total_views: Number(row.total_views),
        unique_sessions: Number(row.unique_sessions),
        avg_events_per_session: Number(row.avg_events_per_session)
    };
}

export async function getSocialClicks(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<SocialClickData[]> {
    const { data, error } = await supabase.rpc("analytics_social_clicks", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null
    });

    if (error) throw error;
    return (data ?? []).map((row: { social_type: string; click_count: number }) => ({
        social_type: row.social_type,
        click_count: Number(row.click_count)
    }));
}

export async function getReviewMetrics(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<ReviewMetrics> {
    const { data, error } = await supabase.rpc("analytics_review_metrics", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null
    });

    if (error) throw error;

    const row = data as {
        total: number;
        avg_rating: number;
        google_redirects: number;
        distribution: { stars: number; count: number }[];
    } | null;

    if (!row) {
        return { total: 0, avg_rating: 0, google_redirects: 0, distribution: [] };
    }

    return {
        total: Number(row.total),
        avg_rating: Number(row.avg_rating),
        google_redirects: Number(row.google_redirects),
        distribution: (row.distribution ?? []).map(d => ({
            stars: Number(d.stars),
            count: Number(d.count)
        }))
    };
}

export async function getSearchRate(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<SearchRateData> {
    const { data, error } = await supabase.rpc("analytics_search_rate", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
        return { search_sessions: 0, total_sessions: 0, rate: 0 };
    }

    return {
        search_sessions: Number(row.search_sessions),
        total_sessions: Number(row.total_sessions),
        rate: Number(row.rate)
    };
}

export async function getHourlyDistribution(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<HourlyData[]> {
    const { data, error } = await supabase.rpc("analytics_hourly_distribution", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null
    });

    if (error) throw error;
    return (data ?? []).map((row: { hour: number; view_count: number }) => ({
        hour: Number(row.hour),
        view_count: Number(row.view_count)
    }));
}

export async function getDeviceDistribution(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<DeviceData[]> {
    const { data, error } = await supabase.rpc("analytics_device_distribution", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null
    });

    if (error) throw error;
    return (data ?? []).map((row: { device_type: string; device_count: number; percentage: number }) => ({
        device_type: row.device_type,
        device_count: Number(row.device_count),
        percentage: Number(row.percentage)
    }));
}

// ── 4C: Insights ──────────────────────────────────────────────────────────

export type SearchTermData = {
    search_term: string;
    search_count: number;
    avg_results: number;
};

export type FunnelStep = {
    step_name: string;
    step_label: string;
    session_count: number;
    percentage: number;
};

export type FeaturedPerformanceData = {
    title: string;
    slot: string;
    click_count: number;
};

export async function getTopSearchTerms(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string,
    limit = 10
): Promise<SearchTermData[]> {
    const { data, error } = await supabase.rpc("analytics_top_search_terms", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null,
        p_limit: limit
    });

    if (error) throw error;
    return (data ?? []).map((row: { search_term: string; search_count: number; avg_results: number }) => ({
        search_term: row.search_term,
        search_count: Number(row.search_count),
        avg_results: Number(row.avg_results)
    }));
}

export async function getConversionFunnel(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<FunnelStep[]> {
    const { data, error } = await supabase.rpc("analytics_conversion_funnel", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null
    });

    if (error) throw error;
    return (data ?? []).map((row: { step_name: string; step_label: string; session_count: number; percentage: number }) => ({
        step_name: row.step_name,
        step_label: row.step_label,
        session_count: Number(row.session_count),
        percentage: Number(row.percentage)
    }));
}

export async function getFeaturedPerformance(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string,
    limit = 10
): Promise<FeaturedPerformanceData[]> {
    const { data, error } = await supabase.rpc("analytics_featured_performance", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null,
        p_limit: limit
    });

    if (error) throw error;
    return (data ?? []).map((row: { title: string; slot: string; click_count: number }) => ({
        title: row.title,
        slot: row.slot,
        click_count: Number(row.click_count)
    }));
}

// ── Orders domain (table ordering epic) ─────────────────────────────────────
// Backed by analytics_orders_* RPCs (migration 20260615130000). SECURITY INVOKER:
// RLS on orders/order_items enforces activity-granular scoping via orders.read.

export type OrdersOverview = {
    orders_count: number;
    revenue: number;
    avg_order_value: number;
    cancellation_rate: number;
    cancelled_count: number;
};

export type OrdersTrendPoint = {
    date: string;
    orders_count: number;
    revenue: number;
};

export type OrdersHourlyPoint = {
    hour: number;
    orders_count: number;
    revenue: number;
};

export type TopOrderedProduct = {
    product_name: string;
    quantity: number;
    revenue: number;
};

export type OrdersTopBy = "quantity" | "revenue";

export type OrdersLatency = {
    delivered_count: number;
    skipped_ready_count: number;
    avg_prep_seconds: number;
    median_prep_seconds: number;
    avg_delivery_seconds: number;
    median_delivery_seconds: number;
    avg_total_seconds: number;
    median_total_seconds: number;
};

export type OrdersConversion = {
    selection_sessions: number;
    orders_count: number;
    conversion_rate: number;
};

export async function getOrdersOverview(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<OrdersOverview> {
    const { data, error } = await supabase.rpc("analytics_orders_overview", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
        return { orders_count: 0, revenue: 0, avg_order_value: 0, cancellation_rate: 0, cancelled_count: 0 };
    }

    return {
        orders_count: Number(row.orders_count),
        revenue: Number(row.revenue),
        avg_order_value: Number(row.avg_order_value),
        cancellation_rate: Number(row.cancellation_rate),
        cancelled_count: Number(row.cancelled_count)
    };
}

export async function getOrdersTrend(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<OrdersTrendPoint[]> {
    const { data, error } = await supabase.rpc("analytics_orders_trend", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null
    });

    if (error) throw error;
    return (data ?? []).map((row: { date: string; orders_count: number; revenue: number }) => ({
        date: row.date,
        orders_count: Number(row.orders_count),
        revenue: Number(row.revenue)
    }));
}

export async function getOrdersHourly(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<OrdersHourlyPoint[]> {
    const { data, error } = await supabase.rpc("analytics_orders_hourly", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null
    });

    if (error) throw error;
    return (data ?? []).map((row: { hour: number; orders_count: number; revenue: number }) => ({
        hour: Number(row.hour),
        orders_count: Number(row.orders_count),
        revenue: Number(row.revenue)
    }));
}

export async function getTopOrderedProducts(
    tenantId: string,
    dateRange: DateRange,
    orderBy: OrdersTopBy = "quantity",
    activityId?: string,
    limit = 10
): Promise<TopOrderedProduct[]> {
    const { data, error } = await supabase.rpc("analytics_top_ordered_products", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null,
        p_limit: limit,
        p_order_by: orderBy
    });

    if (error) throw error;
    return (data ?? []).map((row: { product_name: string; quantity: number; revenue: number }) => ({
        product_name: row.product_name,
        quantity: Number(row.quantity),
        revenue: Number(row.revenue)
    }));
}

export async function getOrdersLatency(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<OrdersLatency> {
    const { data, error } = await supabase.rpc("analytics_orders_latency", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
        return {
            delivered_count: 0,
            skipped_ready_count: 0,
            avg_prep_seconds: 0,
            median_prep_seconds: 0,
            avg_delivery_seconds: 0,
            median_delivery_seconds: 0,
            avg_total_seconds: 0,
            median_total_seconds: 0
        };
    }

    return {
        delivered_count: Number(row.delivered_count),
        skipped_ready_count: Number(row.skipped_ready_count),
        avg_prep_seconds: Number(row.avg_prep_seconds),
        median_prep_seconds: Number(row.median_prep_seconds),
        avg_delivery_seconds: Number(row.avg_delivery_seconds),
        median_delivery_seconds: Number(row.median_delivery_seconds),
        avg_total_seconds: Number(row.avg_total_seconds),
        median_total_seconds: Number(row.median_total_seconds)
    };
}

export async function getOrdersConversion(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<OrdersConversion> {
    const { data, error } = await supabase.rpc("analytics_orders_conversion", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
        return { selection_sessions: 0, orders_count: 0, conversion_rate: 0 };
    }

    return {
        selection_sessions: Number(row.selection_sessions),
        orders_count: Number(row.orders_count),
        conversion_rate: Number(row.conversion_rate)
    };
}

// ── Reservations domain ─────────────────────────────────────────────────────
// Backed by analytics_reservations_* RPCs (migration 20260616130000).
// SECURITY INVOKER: RLS on reservations enforces activity scoping via
// reservations.read. Period window filters on created_at ("received in period").

export type ReservationsOverview = {
    reservations_count: number;
    covers: number;
    confirmed_count: number;
    confirm_rate: number;
    declined_count: number;
    cancelled_count: number;
    online_count: number;
    manual_count: number;
};

export type ReservationsTrendPoint = {
    date: string;
    reservations_count: number;
    covers: number;
};

export type ReservationsHourlyPoint = {
    hour: number;
    reservations_count: number;
};

export async function getReservationsOverview(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<ReservationsOverview> {
    const { data, error } = await supabase.rpc("analytics_reservations_overview", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
        return {
            reservations_count: 0,
            covers: 0,
            confirmed_count: 0,
            confirm_rate: 0,
            declined_count: 0,
            cancelled_count: 0,
            online_count: 0,
            manual_count: 0
        };
    }

    return {
        reservations_count: Number(row.reservations_count),
        covers: Number(row.covers),
        confirmed_count: Number(row.confirmed_count),
        confirm_rate: Number(row.confirm_rate),
        declined_count: Number(row.declined_count),
        cancelled_count: Number(row.cancelled_count),
        online_count: Number(row.online_count),
        manual_count: Number(row.manual_count)
    };
}

export async function getReservationsTrend(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<ReservationsTrendPoint[]> {
    const { data, error } = await supabase.rpc("analytics_reservations_trend", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null
    });

    if (error) throw error;
    return (data ?? []).map((row: { date: string; reservations_count: number; covers: number }) => ({
        date: row.date,
        reservations_count: Number(row.reservations_count),
        covers: Number(row.covers)
    }));
}

export async function getReservationsHourly(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<ReservationsHourlyPoint[]> {
    const { data, error } = await supabase.rpc("analytics_reservations_hourly", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null
    });

    if (error) throw error;
    return (data ?? []).map((row: { hour: number; reservations_count: number }) => ({
        hour: Number(row.hour),
        reservations_count: Number(row.reservations_count)
    }));
}
