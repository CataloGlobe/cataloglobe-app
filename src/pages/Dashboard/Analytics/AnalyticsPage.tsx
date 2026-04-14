import { useCallback, useEffect, useState } from "react";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { getActivities } from "@/services/supabase/activities";
import {
    getPageViewsTrend,
    getTopViewedProducts,
    getTopSelectedProducts,
    getOverviewStats,
    getSocialClicks,
    getReviewMetrics,
    getSearchRate,
    getHourlyDistribution,
    getDeviceDistribution,
    getTopSearchTerms,
    getConversionFunnel,
    getFeaturedPerformance,
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
    type DateRange
} from "@/services/supabase/analytics";
import type { V2Activity } from "@/types/activity";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import AnalyticsFilters, { type PeriodKey } from "./components/AnalyticsFilters";
import OverviewCards from "./components/OverviewCards";
import PageViewsChart from "./components/PageViewsChart";
import TopProductsTable from "./components/TopProductsTable";
import ReviewGuardCard from "./components/ReviewGuardCard";
import DeviceDistribution from "./components/DeviceDistribution";
import SocialClicksChart from "./components/SocialClicksChart";
import HourlyChart from "./components/HourlyChart";
import ConversionFunnel from "./components/ConversionFunnel";
import TopSearchTerms from "./components/TopSearchTerms";
import FeaturedPerformance from "./components/FeaturedPerformance";
import styles from "./Analytics.module.scss";

function periodToDateRange(period: PeriodKey): DateRange {
    const to = new Date();
    const from = new Date();
    switch (period) {
        case "today":
            from.setHours(0, 0, 0, 0);
            break;
        case "7d":
            from.setDate(from.getDate() - 7);
            break;
        case "30d":
            from.setDate(from.getDate() - 30);
            break;
    }
    return { from, to };
}

export default function AnalyticsPage() {
    const tenantId = useTenantId();
    const { selectedTenant } = useTenant();
    const { showToast } = useToast();

    // ── Filtri ───────────────────────────────────────────────────────────
    const [activities, setActivities] = useState<V2Activity[]>([]);
    const [selectedActivityId, setSelectedActivityId] = useState("all");
    const [period, setPeriod] = useState<PeriodKey>("7d");

    // ── Dati 4A ──────────────────────────────────────────────────────────
    const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null);
    const [pageViewsTrend, setPageViewsTrend] = useState<TrendDataPoint[]>([]);
    const [topViewed, setTopViewed] = useState<TopProduct[]>([]);
    const [topSelected, setTopSelected] = useState<TopProduct[]>([]);

    // ── Dati 4B ──────────────────────────────────────────────────────────
    const [socialClicks, setSocialClicks] = useState<SocialClickData[]>([]);
    const [reviewMetrics, setReviewMetrics] = useState<ReviewMetrics | null>(null);
    const [searchRate, setSearchRate] = useState<number | null>(null);
    const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
    const [deviceData, setDeviceData] = useState<DeviceData[]>([]);

    // ── Dati 4C ──────────────────────────────────────────────────────────
    const [searchTerms, setSearchTerms] = useState<SearchTermData[]>([]);
    const [funnelData, setFunnelData] = useState<FunnelStep[]>([]);
    const [featuredPerf, setFeaturedPerf] = useState<FeaturedPerformanceData[]>([]);

    const [isLoading, setIsLoading] = useState(true);

    // ── Load activities (una volta) ──────────────────────────────────────
    useEffect(() => {
        if (!tenantId) return;
        getActivities(tenantId)
            .then(setActivities)
            .catch(() => {});
    }, [tenantId]);

    // ── Load analytics data ──────────────────────────────────────────────
    const loadData = useCallback(async () => {
        if (!tenantId) return;

        try {
            setIsLoading(true);
            const dateRange = periodToDateRange(period);
            const activityId = selectedActivityId === "all" ? undefined : selectedActivityId;

            const [stats, trend, viewed, selected, social, reviews, search, hourly, devices, searchTermsData, funnel, featured] =
                await Promise.all([
                    getOverviewStats(tenantId, dateRange, activityId),
                    getPageViewsTrend(tenantId, dateRange, activityId),
                    getTopViewedProducts(tenantId, dateRange, activityId),
                    getTopSelectedProducts(tenantId, dateRange, activityId),
                    getSocialClicks(tenantId, dateRange, activityId),
                    getReviewMetrics(tenantId, dateRange, activityId),
                    getSearchRate(tenantId, dateRange, activityId),
                    getHourlyDistribution(tenantId, dateRange, activityId),
                    getDeviceDistribution(tenantId, dateRange, activityId),
                    getTopSearchTerms(tenantId, dateRange, activityId),
                    getConversionFunnel(tenantId, dateRange, activityId),
                    getFeaturedPerformance(tenantId, dateRange, activityId)
                ]);

            setOverviewStats(stats);
            setPageViewsTrend(trend);
            setTopViewed(viewed);
            setTopSelected(selected);
            setSocialClicks(social);
            setReviewMetrics(reviews);
            setSearchRate(search.rate);
            setHourlyData(hourly);
            setDeviceData(devices);
            setSearchTerms(searchTermsData);
            setFunnelData(funnel);
            setFeaturedPerf(featured);
        } catch {
            showToast({ message: "Errore nel caricamento analytics", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, period, selectedActivityId, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ── Stato vuoto globale ──────────────────────────────────────────────
    const isEmpty = !isLoading && overviewStats?.total_views === 0;

    return (
        <main className={styles.analytics}>
            <PageHeader
                title="Analitiche"
                businessName={selectedTenant?.name}
                subtitle="Monitora le performance delle tue sedi."
                actions={
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                        <Select
                            value={selectedActivityId}
                            onChange={e => setSelectedActivityId(e.target.value)}
                            options={[
                                { value: "all", label: "Tutte le sedi" },
                                ...activities.map(a => ({ value: a.id, label: a.name }))
                            ]}
                            containerClassName={styles.activitySelectContainer}
                        />
                        <SegmentedControl
                            value={period}
                            onChange={setPeriod}
                            options={[
                                { value: "today", label: "Oggi" },
                                { value: "7d", label: "7 giorni" },
                                { value: "30d", label: "30 giorni" }
                            ]}
                        />
                    </div>
                }
            />

            {isEmpty ? (
                <div className={styles.emptyState}>
                    <Text variant="title-sm" weight={600}>
                        Nessun dato disponibile per il periodo selezionato
                    </Text>
                    <Text variant="body" colorVariant="muted">
                        I dati appariranno quando i clienti visiteranno la pagina pubblica.
                    </Text>
                </div>
            ) : (
                <>
                    <OverviewCards
                        stats={overviewStats}
                        searchRate={searchRate}
                        isLoading={isLoading}
                    />

                    <PageViewsChart data={pageViewsTrend} isLoading={isLoading} />

                    <ConversionFunnel data={funnelData} isLoading={isLoading} />

                    <div className={styles.chartsGrid}>
                        <TopProductsTable
                            title="Prodotti più visti"
                            data={topViewed}
                            countLabel="Visualizzazioni"
                            isLoading={isLoading}
                        />
                        <TopProductsTable
                            title="Prodotti più selezionati"
                            data={topSelected}
                            countLabel="Aggiunte"
                            isLoading={isLoading}
                        />
                    </div>

                    <div className={styles.chartsGrid}>
                        <TopSearchTerms data={searchTerms} isLoading={isLoading} />
                        <FeaturedPerformance data={featuredPerf} isLoading={isLoading} />
                    </div>

                    <hr className={styles.sectionDivider} />

                    <div className={styles.chartsGrid}>
                        <ReviewGuardCard data={reviewMetrics} isLoading={isLoading} />
                        <DeviceDistribution data={deviceData} isLoading={isLoading} />
                    </div>

                    <div className={styles.chartsGrid}>
                        <SocialClicksChart data={socialClicks} isLoading={isLoading} />
                        <HourlyChart data={hourlyData} isLoading={isLoading} />
                    </div>
                </>
            )}
        </main>
    );
}
