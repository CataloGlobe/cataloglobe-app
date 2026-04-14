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

// ── Helpers ──────────────────────────────────────────────────────────────

function diffDays(range: DateRange): number {
    return Math.ceil((range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Service functions ────────────────────────────────────────────────────

export async function getPageViewsTrend(
    tenantId: string,
    dateRange: DateRange,
    activityId?: string
): Promise<TrendDataPoint[]> {
    const granularity = diffDays(dateRange) > 30 ? "week" : "day";

    const { data, error } = await supabase.rpc("analytics_page_views_trend", {
        p_tenant_id: tenantId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_activity_id: activityId ?? null,
        p_granularity: granularity
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
