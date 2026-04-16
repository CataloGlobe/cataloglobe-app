import { useCallback, useEffect, useState } from "react";
import { FileDown } from "lucide-react";
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
import { Button } from "@/components/ui/Button/Button";
import { Select } from "@/components/ui/Select/Select";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import AnalyticsFilters from "./components/AnalyticsFilters";
import { buildXlsxWorkbook, downloadXlsx, type XlsxSection } from "./utils/exportXlsx";
import { getPreviousRange, getPreviousPeriodLabel, type PeriodKey } from "./utils/periodComparison";
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
        case "90d":
            from.setDate(from.getDate() - 90);
            break;
        case "all":
            return { from: new Date(2020, 0, 1), to };
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

    // ── Confronto periodo precedente ─────────────────────────────────────
    const [previousOverviewStats, setPreviousOverviewStats] = useState<OverviewStats | null>(null);
    const [previousSearchRate, setPreviousSearchRate] = useState<number | null>(null);

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
            const comparePeriod = period !== "all";
            const previousRange = comparePeriod ? getPreviousRange(dateRange) : dateRange;

            const [stats, trend, viewed, selected, social, reviews, search, hourly, devices, searchTermsData, funnel, featured, prevStats, prevSearch] =
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
                    getFeaturedPerformance(tenantId, dateRange, activityId),
                    comparePeriod ? getOverviewStats(tenantId, previousRange, activityId) : Promise.resolve(null),
                    comparePeriod ? getSearchRate(tenantId, previousRange, activityId) : Promise.resolve(null)
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
            setPreviousOverviewStats(prevStats ?? null);
            setPreviousSearchRate(prevSearch?.rate ?? null);
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

    // ── Export Excel ─────────────────────────────────────────────────────
    const handleExportXlsx = useCallback(() => {
        const SLOT_LABELS: Record<string, string> = {
            hero: "Hero",
            before_catalog: "Prima del catalogo",
            after_catalog: "Dopo il catalogo"
        };

        const sections: XlsxSection[] = [
            {
                name: "Panoramica",
                headers: ["Metrica", "Valore"],
                rows: overviewStats
                    ? [
                          ["Visite totali", overviewStats.total_views],
                          ["Sessioni uniche", overviewStats.unique_sessions],
                          ["Media eventi/sessione", overviewStats.avg_events_per_session],
                          ["Tasso di ricerca (%)", searchRate ?? 0]
                      ]
                    : [],
                columnWidths: [28, 14]
            },
            {
                name: "Visite nel tempo",
                headers: ["Data", "Visite"],
                rows: pageViewsTrend.map(r => [r.date, r.count]),
                columnWidths: [14, 10]
            },
            {
                name: "Prodotti più visti",
                headers: ["#", "Prodotto", "Visualizzazioni"],
                rows: topViewed.map((r, i) => [i + 1, r.product_name, r.count])
            },
            {
                name: "Prodotti più selezionati",
                headers: ["#", "Prodotto", "Aggiunte"],
                rows: topSelected.map((r, i) => [i + 1, r.product_name, r.count])
            },
            {
                name: "Funnel conversione",
                headers: ["Step", "Sessioni", "Percentuale"],
                rows: funnelData.map(r => [r.step_label, r.session_count, r.percentage / 100]),
                columnFormats: [undefined, undefined, "0.0%"],
                columnWidths: [24, 12, 14]
            },
            {
                name: "Termini di ricerca",
                headers: ["#", "Termine", "Ricerche", "Media risultati"],
                rows: searchTerms.map((r, i) => [i + 1, r.search_term, r.search_count, r.avg_results])
            },
            {
                name: "Contenuti in evidenza",
                headers: ["#", "Titolo", "Posizione", "Click"],
                rows: featuredPerf.map((r, i) => [
                    i + 1,
                    r.title,
                    SLOT_LABELS[r.slot] ?? r.slot,
                    r.click_count
                ]),
                columnWidths: [6, 32, 22, 10]
            },
            {
                name: "Review Guard",
                headers: ["Metrica", "Valore"],
                rows: reviewMetrics
                    ? [
                          ["Totale recensioni", reviewMetrics.total],
                          ["Media stelle", reviewMetrics.avg_rating],
                          ["Redirect a Google", reviewMetrics.google_redirects]
                      ]
                    : [],
                columnWidths: [22, 14]
            },
            {
                name: "Distribuzione stelle",
                headers: ["Stelle", "Conteggio"],
                rows: reviewMetrics?.distribution.map(r => [r.stars, r.count]) ?? [],
                columnWidths: [10, 12]
            },
            {
                name: "Dispositivi",
                headers: ["Tipo", "Percentuale"],
                rows: deviceData.map(r => [r.device_type, r.percentage / 100]),
                columnFormats: [undefined, "0.0%"],
                columnWidths: [14, 14]
            },
            {
                name: "Click social",
                headers: ["Piattaforma", "Click"],
                rows: socialClicks.map(r => [r.social_type, r.click_count]),
                columnWidths: [18, 10]
            },
            {
                name: "Fasce orarie",
                headers: ["Ora", "Visite"],
                rows: hourlyData.map(r => [r.hour, r.view_count]),
                columnWidths: [8, 10]
            }
        ];

        const wb = buildXlsxWorkbook(sections);

        const sedeSlug =
            selectedActivityId === "all"
                ? "tutte-le-sedi"
                : (activities.find(a => a.id === selectedActivityId)?.slug ?? selectedActivityId);
        const periodoLabel: Record<PeriodKey, string> = {
            today: "oggi",
            "7d": "7-giorni",
            "30d": "30-giorni",
            "90d": "90-giorni",
            all: "tutto"
        };
        const date = new Date().toISOString().split("T")[0];
        const filename = `analytics_cataloglobe_${sedeSlug}_${periodoLabel[period]}_${date}.xlsx`;

        downloadXlsx(wb, filename);
    }, [
        overviewStats,
        searchRate,
        pageViewsTrend,
        topViewed,
        topSelected,
        funnelData,
        searchTerms,
        featuredPerf,
        reviewMetrics,
        deviceData,
        socialClicks,
        hourlyData,
        selectedActivityId,
        activities,
        period
    ]);

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
                                { value: "30d", label: "30 giorni" },
                                { value: "90d", label: "90 giorni" },
                                { value: "all", label: "Tutto" }
                            ]}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<FileDown size={14} />}
                            disabled={isLoading || isEmpty}
                            onClick={handleExportXlsx}
                        >
                            Esporta Excel
                        </Button>
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
                        previousStats={previousOverviewStats}
                        previousSearchRate={previousSearchRate}
                        previousPeriodLabel={getPreviousPeriodLabel(period)}
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
