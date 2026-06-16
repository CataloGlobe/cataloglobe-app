import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { useSedeScope, SCOPE_ALL } from "@/hooks/useSedeScope";
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
    type ReservationsHourlyPoint,
    type DateRange
} from "@/services/supabase/analytics";
import { usePlanFeatures } from "@/lib/planFeatures";
import { usePageHeader } from "@/context/usePageHeader";
import { PageGate } from "@/components/PageGate/PageGate";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
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
import OrdersOverviewCards from "./components/OrdersOverviewCards";
import OrdersTrendChart from "./components/OrdersTrendChart";
import OrdersHourlyChart from "./components/OrdersHourlyChart";
import OrdersTopProductsTable from "./components/OrdersTopProductsTable";
import OrdersLatencyCard from "./components/OrdersLatencyCard";
import OrdersConversionCard from "./components/OrdersConversionCard";
import ReservationsOverviewCards from "./components/ReservationsOverviewCards";
import ReservationsTrendChart from "./components/ReservationsTrendChart";
import ReservationsHourlyChart from "./components/ReservationsHourlyChart";
import ReservationsSoonCard from "./components/ReservationsSoonCard";
import { formatEur, formatDuration } from "./utils/ordersFormat";
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
    const { showToast } = useToast();

    // ── Filtri ───────────────────────────────────────────────────────────
    // Sede attiva: dalla navbar via useSedeScope. SCOPE_ALL → "tutte le sedi"
    // (passare `undefined` come activityId ai service analytics).
    const { value: scopeValue, readableActivities } = useSedeScope();
    const selectedActivityId = scopeValue === SCOPE_ALL ? "all" : scopeValue;
    const [period, setPeriod] = useState<PeriodKey>("7d");

    // Sezione Ordini: visibile solo se il piano del tenant abilita l'ordinazione
    // al tavolo. Loading-optimistic (plan null → true) come Sidebar/planFeatures.
    const { hasFeature } = usePlanFeatures();
    const ordersFeature = hasFeature("table_ordering");
    const reservationsFeature = hasFeature("table_reservation");

    // ── Confronto periodo precedente ─────────────────────────────────────
    const [previousOverviewStats, setPreviousOverviewStats] = useState<OverviewStats | null>(null);

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

    // ── Dati Ordini ───────────────────────────────────────────────────────
    const [ordersOverview, setOrdersOverview] = useState<OrdersOverview | null>(null);
    const [previousOrdersOverview, setPreviousOrdersOverview] = useState<OrdersOverview | null>(null);
    const [ordersTrend, setOrdersTrend] = useState<OrdersTrendPoint[]>([]);
    const [ordersHourly, setOrdersHourly] = useState<OrdersHourlyPoint[]>([]);
    const [topOrderedByQty, setTopOrderedByQty] = useState<TopOrderedProduct[]>([]);
    const [topOrderedByRevenue, setTopOrderedByRevenue] = useState<TopOrderedProduct[]>([]);
    const [ordersLatency, setOrdersLatency] = useState<OrdersLatency | null>(null);
    const [ordersConversion, setOrdersConversion] = useState<OrdersConversion | null>(null);

    // ── Dati Prenotazioni ─────────────────────────────────────────────────
    const [reservationsOverview, setReservationsOverview] = useState<ReservationsOverview | null>(null);
    const [previousReservationsOverview, setPreviousReservationsOverview] = useState<ReservationsOverview | null>(null);
    const [reservationsTrend, setReservationsTrend] = useState<ReservationsTrendPoint[]>([]);
    const [reservationsHourly, setReservationsHourly] = useState<ReservationsHourlyPoint[]>([]);

    const [isLoading, setIsLoading] = useState(true);

    // ── Load analytics data ──────────────────────────────────────────────
    const loadData = useCallback(async () => {
        if (!tenantId) return;

        try {
            setIsLoading(true);
            const dateRange = periodToDateRange(period);
            const activityId = selectedActivityId === "all" ? undefined : selectedActivityId;
            const comparePeriod = period !== "all";
            const previousRange = comparePeriod ? getPreviousRange(dateRange) : dateRange;

            const [stats, trend, viewed, selected, social, reviews, search, hourly, devices, searchTermsData, funnel, featured, prevStats] =
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
                    comparePeriod ? getOverviewStats(tenantId, previousRange, activityId) : Promise.resolve(null)
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

            // ── Ordini (solo se il piano abilita l'ordinazione al tavolo) ──
            if (ordersFeature) {
                const [ordOverview, ordTrend, ordHourly, topQty, topRevenue, ordLatency, ordConversion, prevOrdOverview] =
                    await Promise.all([
                        getOrdersOverview(tenantId, dateRange, activityId),
                        getOrdersTrend(tenantId, dateRange, activityId),
                        getOrdersHourly(tenantId, dateRange, activityId),
                        getTopOrderedProducts(tenantId, dateRange, "quantity", activityId),
                        getTopOrderedProducts(tenantId, dateRange, "revenue", activityId),
                        getOrdersLatency(tenantId, dateRange, activityId),
                        getOrdersConversion(tenantId, dateRange, activityId),
                        comparePeriod ? getOrdersOverview(tenantId, previousRange, activityId) : Promise.resolve(null)
                    ]);

                setOrdersOverview(ordOverview);
                setOrdersTrend(ordTrend);
                setOrdersHourly(ordHourly);
                setTopOrderedByQty(topQty);
                setTopOrderedByRevenue(topRevenue);
                setOrdersLatency(ordLatency);
                setOrdersConversion(ordConversion);
                setPreviousOrdersOverview(prevOrdOverview ?? null);
            }

            // ── Prenotazioni (solo se il piano abilita le prenotazioni) ──
            // Base periodo = created_at ("prenotazioni ricevute nel periodo").
            if (reservationsFeature) {
                const [resOverview, resTrend, resHourly, prevResOverview] = await Promise.all([
                    getReservationsOverview(tenantId, dateRange, activityId),
                    getReservationsTrend(tenantId, dateRange, activityId),
                    getReservationsHourly(tenantId, dateRange, activityId),
                    comparePeriod ? getReservationsOverview(tenantId, previousRange, activityId) : Promise.resolve(null)
                ]);

                setReservationsOverview(resOverview);
                setReservationsTrend(resTrend);
                setReservationsHourly(resHourly);
                setPreviousReservationsOverview(prevResOverview ?? null);
            }
        } catch {
            showToast({ message: "Errore nel caricamento analytics", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, period, selectedActivityId, ordersFeature, reservationsFeature, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ── Stato vuoto globale ──────────────────────────────────────────────
    // Vuoto solo se non c'è engagement E (niente ordini o nessun ordine):
    // un tenant con ordini ma senza page_view non deve vedere lo stato vuoto.
    const isEmpty =
        !isLoading &&
        overviewStats?.total_views === 0 &&
        (!ordersFeature || (ordersOverview?.orders_count ?? 0) === 0) &&
        (!reservationsFeature || (reservationsOverview?.reservations_count ?? 0) === 0);

    // Conversione selezione = % finale del funnel (selection_add / page_view),
    // già calcolata server-side. Derivata dai dati funnel in stato, no nuovo RPC.
    const selectionConversion =
        funnelData.length > 0 ? funnelData[funnelData.length - 1].percentage : null;

    // Prenotazioni: dati popolati solo se ce n'è almeno una nel periodo;
    // altrimenti la sezione cade sull'empty-state.
    const hasReservations = (reservationsOverview?.reservations_count ?? 0) > 0;

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

        if (ordersFeature) {
            const CURRENCY_FMT = "#,##0.00 €";
            sections.push(
                {
                    name: "Ordini - Panoramica",
                    headers: ["Metrica", "Valore"],
                    rows: ordersOverview
                        ? [
                              ["Ordini", ordersOverview.orders_count],
                              ["Ricavi", formatEur(ordersOverview.revenue)],
                              ["Valore medio ordine", formatEur(ordersOverview.avg_order_value)],
                              ["Tasso annullamento (%)", ordersOverview.cancellation_rate],
                              ["Ordini annullati", ordersOverview.cancelled_count]
                          ]
                        : [],
                    columnWidths: [26, 16]
                },
                {
                    name: "Ordini - Andamento",
                    headers: ["Data", "Ordini", "Ricavi"],
                    rows: ordersTrend.map(r => [r.date, r.orders_count, r.revenue]),
                    columnFormats: [undefined, undefined, CURRENCY_FMT],
                    columnWidths: [14, 10, 14]
                },
                {
                    name: "Top prodotti ordinati (qtà)",
                    headers: ["#", "Prodotto", "Quantità", "Ricavi"],
                    rows: topOrderedByQty.map((r, i) => [i + 1, r.product_name, r.quantity, r.revenue]),
                    columnFormats: [undefined, undefined, undefined, CURRENCY_FMT],
                    columnWidths: [6, 32, 12, 14]
                },
                {
                    name: "Top prodotti ordinati (ricavi)",
                    headers: ["#", "Prodotto", "Quantità", "Ricavi"],
                    rows: topOrderedByRevenue.map((r, i) => [i + 1, r.product_name, r.quantity, r.revenue]),
                    columnFormats: [undefined, undefined, undefined, CURRENCY_FMT],
                    columnWidths: [6, 32, 12, 14]
                },
                {
                    name: "Tempi operativi",
                    headers: ["Fase", "Media", "Mediana"],
                    rows: ordersLatency
                        ? [
                              ["Preparazione", formatDuration(ordersLatency.avg_prep_seconds), formatDuration(ordersLatency.median_prep_seconds)],
                              ["Consegna", formatDuration(ordersLatency.avg_delivery_seconds), formatDuration(ordersLatency.median_delivery_seconds)],
                              ["Totale", formatDuration(ordersLatency.avg_total_seconds), formatDuration(ordersLatency.median_total_seconds)],
                              ["Ordini consegnati", ordersLatency.delivered_count, ""],
                              ["Consegne dirette (no 'Pronto')", ordersLatency.skipped_ready_count, ""]
                          ]
                        : [],
                    columnWidths: [30, 14, 14]
                },
                {
                    name: "Conversione sel.-ordine",
                    headers: ["Metrica", "Valore"],
                    rows: ordersConversion
                        ? [
                              ["Sessioni con selezione", ordersConversion.selection_sessions],
                              ["Ordini inviati", ordersConversion.orders_count],
                              ["Tasso di conversione (%)", ordersConversion.conversion_rate]
                          ]
                        : [],
                    columnWidths: [26, 14]
                },
                {
                    name: "Ordini - Fasce orarie",
                    headers: ["Ora", "Ordini", "Ricavi"],
                    rows: ordersHourly.map(r => [r.hour, r.orders_count, r.revenue]),
                    columnFormats: [undefined, undefined, CURRENCY_FMT],
                    columnWidths: [8, 10, 14]
                }
            );
        }

        if (reservationsFeature) {
            sections.push(
                {
                    name: "Prenotazioni - Panoramica",
                    headers: ["Metrica", "Valore"],
                    rows: reservationsOverview
                        ? [
                              ["Prenotazioni (ricevute)", reservationsOverview.reservations_count],
                              ["Coperti", reservationsOverview.covers],
                              ["Confermate", reservationsOverview.confirmed_count],
                              ["Tasso conferma (%)", reservationsOverview.confirm_rate],
                              ["Rifiutate", reservationsOverview.declined_count],
                              ["Annullate", reservationsOverview.cancelled_count],
                              ["Online", reservationsOverview.online_count],
                              ["Manuali", reservationsOverview.manual_count]
                          ]
                        : [],
                    columnWidths: [28, 16]
                },
                {
                    name: "Prenotazioni - Andamento",
                    headers: ["Data", "Prenotazioni", "Coperti"],
                    rows: reservationsTrend.map(r => [r.date, r.reservations_count, r.covers]),
                    columnWidths: [14, 14, 10]
                },
                {
                    name: "Prenotazioni - Fasce orarie",
                    headers: ["Ora", "Prenotazioni"],
                    rows: reservationsHourly.map(r => [r.hour, r.reservations_count]),
                    columnWidths: [8, 14]
                }
            );
        }

        const wb = buildXlsxWorkbook(sections);

        const sedeSlug =
            selectedActivityId === "all"
                ? "tutte-le-sedi"
                : (readableActivities.find(a => a.id === selectedActivityId)?.slug ?? selectedActivityId);
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
        ordersFeature,
        ordersOverview,
        ordersTrend,
        ordersHourly,
        topOrderedByQty,
        topOrderedByRevenue,
        ordersLatency,
        ordersConversion,
        reservationsFeature,
        reservationsOverview,
        reservationsTrend,
        reservationsHourly,
        selectedActivityId,
        readableActivities,
        period
    ]);

    // Selettore sede vive nella navbar (SedeScopeSelect). Nella banda:
    // periodo a sinistra (leading), Esporta a destra (actions).
    const leading = useMemo(() => (
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
    ), [period]);

    const headerActions = useMemo(() => (
        <Button
            variant="outline"
            leftIcon={<Download size={16} />}
            disabled={isLoading || isEmpty}
            onClick={handleExportXlsx}
            className={styles.toolbarCta}
        >
            Esporta Excel
        </Button>
    ), [isLoading, isEmpty, handleExportXlsx]);

    usePageHeader({
        leading,
        actions: headerActions,
        sticky: true,
    });

    return (
        <PageGate readPermission="analytics.read" activityId={selectedActivityId === "all" ? null : selectedActivityId}>
            {() => (
        <main className={styles.analytics}>
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
                    {/* ── SEZIONE ENGAGEMENT ── */}
                    <div className={styles.sectionHeader}>
                        <Text variant="title-sm" weight={600}>
                            Engagement
                        </Text>
                        <Text variant="caption" colorVariant="muted">
                            Traffico e interazioni nel periodo selezionato
                        </Text>
                    </div>

                    <OverviewCards
                        stats={overviewStats}
                        selectionConversion={selectionConversion}
                        previousStats={previousOverviewStats}
                        previousPeriodLabel={getPreviousPeriodLabel(period)}
                        isLoading={isLoading}
                    />

                    <PageViewsChart data={pageViewsTrend} isLoading={isLoading} />

                    <div className={styles.chartsGrid}>
                        <DeviceDistribution data={deviceData} isLoading={isLoading} />
                        <HourlyChart data={hourlyData} isLoading={isLoading} />
                    </div>

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

                    <div className={styles.chartsGrid}>
                        <ReviewGuardCard data={reviewMetrics} isLoading={isLoading} />
                        <SocialClicksChart data={socialClicks} isLoading={isLoading} />
                    </div>

                    {/* ── SEZIONE ORDINI (interno invariato) ── */}
                    {ordersFeature && (
                        <>
                            <hr className={styles.sectionDivider} />

                            <div className={styles.sectionHeader}>
                                <Text variant="title-sm" weight={600}>
                                    Ordini
                                </Text>
                                <Text variant="caption" colorVariant="muted">
                                    Ordinazioni dal tavolo nel periodo selezionato
                                </Text>
                            </div>

                            <OrdersOverviewCards
                                data={ordersOverview}
                                previous={previousOrdersOverview}
                                previousPeriodLabel={getPreviousPeriodLabel(period)}
                                isLoading={isLoading}
                            />

                            <OrdersTrendChart
                                data={ordersTrend}
                                dateRange={periodToDateRange(period)}
                                period={period}
                                isLoading={isLoading}
                            />

                            <div className={styles.chartsGrid}>
                                <OrdersTopProductsTable
                                    title="Top prodotti ordinati (quantità)"
                                    data={topOrderedByQty}
                                    rankBy="quantity"
                                    isLoading={isLoading}
                                />
                                <OrdersTopProductsTable
                                    title="Top prodotti ordinati (ricavi)"
                                    data={topOrderedByRevenue}
                                    rankBy="revenue"
                                    isLoading={isLoading}
                                />
                            </div>

                            <div className={styles.chartsGrid}>
                                <OrdersLatencyCard data={ordersLatency} isLoading={isLoading} />
                                <OrdersConversionCard data={ordersConversion} isLoading={isLoading} />
                            </div>

                            <OrdersHourlyChart data={ordersHourly} isLoading={isLoading} />
                        </>
                    )}

                    {/* ── SEZIONE PRENOTAZIONI (solo empty-state — niente fetch) ── */}
                    {reservationsFeature && (
                        <>
                            <hr className={styles.sectionDivider} />

                            <div className={styles.sectionHeader}>
                                <Text variant="title-sm" weight={600}>
                                    Prenotazioni
                                </Text>
                                <Text variant="caption" colorVariant="muted">
                                    Prenotazioni ricevute nel periodo selezionato
                                </Text>
                            </div>

                            {isLoading || hasReservations ? (
                                <>
                                    <ReservationsOverviewCards
                                        data={reservationsOverview}
                                        previous={previousReservationsOverview}
                                        previousPeriodLabel={getPreviousPeriodLabel(period)}
                                        isLoading={isLoading}
                                    />

                                    <ReservationsTrendChart
                                        data={reservationsTrend}
                                        dateRange={periodToDateRange(period)}
                                        period={period}
                                        isLoading={isLoading}
                                    />

                                    <div className={styles.chartsGrid}>
                                        <ReservationsHourlyChart data={reservationsHourly} isLoading={isLoading} />
                                        <ReservationsSoonCard
                                            title="No-show"
                                            description="Prenotazioni che non si presentano. Disponibile quando il flusso registrerà lo stato no-show."
                                        />
                                    </div>

                                    <div className={styles.chartsGrid}>
                                        <ReservationsSoonCard
                                            title="Tempi di permanenza"
                                            description="Durata media al tavolo (seduta → completamento). Disponibile quando il flusso registrerà seduta e completamento."
                                        />
                                        <ReservationsSoonCard
                                            title="Utilizzo tavoli"
                                            description="Occupazione e rotazione dei tavoli. Disponibile quando le prenotazioni saranno assegnate a un tavolo."
                                        />
                                    </div>
                                </>
                            ) : (
                                <article className={styles.chartCard} aria-label="Prenotazioni">
                                    <header className={styles.chartCardHeader}>
                                        <Text variant="title-sm" align="left">
                                            Prenotazioni
                                        </Text>
                                    </header>
                                    <div className={styles.chartCardBody}>
                                        <div className={styles.chartEmpty}>
                                            <div className={styles.emptyStacked}>
                                                <Text variant="body" colorVariant="muted">
                                                    Ancora nessuna prenotazione nel periodo selezionato.
                                                </Text>
                                                <Text variant="caption" colorVariant="muted">
                                                    Le metriche compariranno appena arrivano i dati.
                                                </Text>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            )}
                        </>
                    )}
                </>
            )}
        </main>
            )}
        </PageGate>
    );
}
