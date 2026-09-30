import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, Download } from "lucide-react";
import { useTenantId } from "@/context/useTenantId";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnActivity, canDoOnAnyActivity } from "@/lib/permissions";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { useSedeScope, SCOPE_ALL } from "@/hooks/useSedeScope";
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
import { usePlanFeatures } from "@/lib/planFeatures";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { PageGate } from "@/components/PageGate/PageGate";
import { Button } from "@/components/ui/Button/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import {
    buildXlsxWorkbook,
    downloadXlsx,
    type Cell,
    type CoverSpec,
    type SheetSpec
} from "./utils/exportXlsx";
import {
    DEFAULT_PERIOD,
    getPreviousRange,
    getPreviousPeriodLabel,
    parsePeriod,
    periodToDateRange,
    type PeriodKey
} from "./utils/periodComparison";
import SampleBand from "./components/SampleBand";
import SearchSection from "./components/SearchSection";
import ViewsSection from "./components/ViewsSection";
import ReviewsSection from "./components/ReviewsSection";
import OrdersSection from "./components/OrdersSection";
import ReservationsSection from "./components/ReservationsSection";
import CollapsedSections from "./components/CollapsedSections";
import styles from "./Analytics.module.scss";

export default function AnalyticsPage() {
    const tenantId = useTenantId();
    const { permissions } = usePermissions();

    // ── Filtri ───────────────────────────────────────────────────────────
    // Sede attiva: dalla navbar via useSedeScope. SCOPE_ALL → "tutte le sedi"
    // (passare `undefined` come activityId ai service analytics).
    const { value: scopeValue, readableActivities } = useSedeScope();
    const selectedActivityId = scopeValue === SCOPE_ALL ? "all" : scopeValue;
    // Gate di lettura prima di ogni fetch (#590): lo stesso che rende `PageGate`.
    const canRead =
        permissions != null &&
        (selectedActivityId === "all"
            ? canDoOnAnyActivity(permissions, "analytics.read")
            : canDoOnActivity(permissions, "analytics.read", selectedActivityId));

    // Il periodo vive nell'URL (`?period=`, A3): il refresh non lo perde e si
    // può linkare. Default 30 giorni, come il mockup.
    const [searchParams, setSearchParams] = useSearchParams();
    const period = parsePeriod(searchParams.get("period"));
    const setPeriod = useCallback(
        (next: PeriodKey) => {
            setSearchParams(
                prev => {
                    if (next === DEFAULT_PERIOD) prev.delete("period");
                    else prev.set("period", next);
                    return prev;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

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
    const [loadError, setLoadError] = useState(false);

    // ── Load analytics data ──────────────────────────────────────────────
    // Cambiando periodo in fretta le risposte possono arrivare fuori ordine:
    // vale solo l'ultima richiesta partita.
    const requestRef = useRef(0);
    const loadData = useCallback(async () => {
        if (!tenantId || !canRead) return;

        const requestId = ++requestRef.current;
        setIsLoading(true);
        setLoadError(false);
        try {
            const dateRange = periodToDateRange(period);
            const activityId = selectedActivityId === "all" ? undefined : selectedActivityId;
            const comparePeriod = period !== "all";
            const previousRange = comparePeriod ? getPreviousRange(dateRange) : dateRange;

            // Un solo giro: le tre famiglie di RPC sono indipendenti (prima
            // erano tre cascate, il tempo era la loro somma).
            const [engagement, orders, reservations] = await Promise.all([
                Promise.all([
                    getOverviewStats(tenantId, dateRange, activityId),
                    getPageViewsTrend(tenantId, dateRange, activityId),
                    getTopViewedProducts(tenantId, dateRange, activityId),
                    getTopSelectedProducts(tenantId, dateRange, activityId),
                    getSocialClicks(tenantId, dateRange, activityId),
                    getReviewMetrics(tenantId, dateRange, activityId),
                    getHourlyDistribution(tenantId, dateRange, activityId),
                    getDeviceDistribution(tenantId, dateRange, activityId),
                    getTopSearchTerms(tenantId, dateRange, activityId),
                    getConversionFunnel(tenantId, dateRange, activityId),
                    getFeaturedPerformance(tenantId, dateRange, activityId),
                    comparePeriod ? getOverviewStats(tenantId, previousRange, activityId) : Promise.resolve(null)
                ] as const),
                ordersFeature
                    ? Promise.all([
                          getOrdersOverview(tenantId, dateRange, activityId),
                          getOrdersTrend(tenantId, dateRange, activityId),
                          getOrdersHourly(tenantId, dateRange, activityId),
                          getTopOrderedProducts(tenantId, dateRange, "quantity", activityId),
                          getTopOrderedProducts(tenantId, dateRange, "revenue", activityId),
                          getOrdersLatency(tenantId, dateRange, activityId),
                          getOrdersConversion(tenantId, dateRange, activityId),
                          comparePeriod ? getOrdersOverview(tenantId, previousRange, activityId) : Promise.resolve(null)
                      ] as const)
                    : Promise.resolve(null),
                // Base periodo = created_at ("prenotazioni ricevute nel periodo").
                reservationsFeature
                    ? Promise.all([
                          getReservationsOverview(tenantId, dateRange, activityId),
                          getReservationsTrend(tenantId, dateRange, activityId),
                          getReservationsHourly(tenantId, dateRange, activityId),
                          comparePeriod ? getReservationsOverview(tenantId, previousRange, activityId) : Promise.resolve(null)
                      ] as const)
                    : Promise.resolve(null)
            ]);
            if (requestId !== requestRef.current) return;

            const [stats, trend, viewed, selected, social, reviews, hourly, devices, searchTermsData, funnel, featured, prevStats] = engagement;
            setOverviewStats(stats);
            setPageViewsTrend(trend);
            setTopViewed(viewed);
            setTopSelected(selected);
            setSocialClicks(social);
            setReviewMetrics(reviews);
            setHourlyData(hourly);
            setDeviceData(devices);
            setSearchTerms(searchTermsData);
            setFunnelData(funnel);
            setFeaturedPerf(featured);
            setPreviousOverviewStats(prevStats ?? null);

            if (orders) {
                const [ordOverview, ordTrend, ordHourly, topQty, topRevenue, ordLatency, ordConversion, prevOrdOverview] = orders;
                setOrdersOverview(ordOverview);
                setOrdersTrend(ordTrend);
                setOrdersHourly(ordHourly);
                setTopOrderedByQty(topQty);
                setTopOrderedByRevenue(topRevenue);
                setOrdersLatency(ordLatency);
                setOrdersConversion(ordConversion);
                setPreviousOrdersOverview(prevOrdOverview ?? null);
            }

            if (reservations) {
                const [resOverview, resTrend, resHourly, prevResOverview] = reservations;
                setReservationsOverview(resOverview);
                setReservationsTrend(resTrend);
                setReservationsHourly(resHourly);
                setPreviousReservationsOverview(prevResOverview ?? null);
            }
        } catch (error) {
            if (requestId !== requestRef.current) return;
            // Un errore non lascia a schermo i dati del periodo prima: la
            // pagina lo dice, con «Riprova».
            console.error("Caricamento analitiche:", error);
            setLoadError(true);
        } finally {
            if (requestId === requestRef.current) setIsLoading(false);
        }
    }, [tenantId, canRead, period, selectedActivityId, ordersFeature, reservationsFeature]);

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

    // Le sezioni senza dati nel periodo collassano in fondo (§36.3); con i
    // dati risalgono da sé al loro posto (ordine fisso per tipo di dato).
    const ordersEmpty = ordersFeature && !isLoading && (ordersOverview?.orders_count ?? 0) === 0;
    const reservationsEmpty =
        reservationsFeature && !isLoading && (reservationsOverview?.reservations_count ?? 0) === 0;
    const scopedActivities = useMemo(
        () => (selectedActivityId === "all" ? readableActivities : readableActivities.filter(a => a.id === selectedActivityId)),
        [readableActivities, selectedActivityId]
    );
    const dateRange = useMemo(() => periodToDateRange(period), [period]);

    // ── Export Excel ─────────────────────────────────────────────────────
    const handleExportXlsx = useCallback(() => {
        const SLOT_LABELS: Record<string, string> = {
            before_catalog: "Prima del menù",
            after_catalog: "Dopo il menù"
        };

        const CURRENCY_FMT = "#,##0.00 €";
        const DURATION_FMT = '#,##0" s"';
        const PCT_FMT = "0.0%";

        // numero grezzo + numFmt valuta (mai stringa pre-formattata).
        const eur = (v: number | null | undefined): Cell => ({ v: v ?? 0, numFmt: CURRENCY_FMT });
        // durata in secondi come numero (resta calcolabile) + formato " s".
        const dur = (s: number | null | undefined): Cell => ({ v: s ?? 0, numFmt: DURATION_FMT });
        // percentuale: dato sorgente 0–100 → frazione 0–1 + formato nativo 0.0%.
        const pct = (v: number | null | undefined): Cell => ({ v: (v ?? 0) / 100, numFmt: PCT_FMT });

        const NAME_W = 40; // larghezza colonne nome prodotto / titolo

        // ── Pagina pubblica (sempre) ─────────────────────────────────────────
        // Dati grezzi com'è (A5), con le parole della pagina: «visite», non
        // «sessioni» né «visitatori» (§36.1/2).
        const engagement: SheetSpec = {
            name: "Pagina pubblica",
            title: "PAGINA PUBBLICA",
            blocks: [
                {
                    subtitle: "Panoramica",
                    headers: ["Metrica", "Valore"],
                    rows: overviewStats
                        ? [
                              ["Visite", overviewStats.total_views],
                              ["Eventi per visita", overviewStats.avg_events_per_session],
                              ["Visite con un'aggiunta alla selezione", pct(selectionConversion)]
                          ]
                        : []
                },
                {
                    subtitle: "Visite nel tempo",
                    headers: ["Data", "Visite"],
                    rows: pageViewsTrend.map(r => [r.date, r.count])
                },
                {
                    subtitle: "Dispositivi",
                    headers: ["Tipo", "Percentuale"],
                    rows: deviceData.map(r => [r.device_type, pct(r.percentage)])
                },
                {
                    subtitle: "Fasce orarie",
                    headers: ["Ora", "Visite"],
                    rows: hourlyData.map(r => [r.hour, r.view_count])
                },
                {
                    subtitle: "Dalla visita alla selezione",
                    headers: ["Passo", "Visite", "Percentuale"],
                    rows: funnelData.map(r => [r.step_label, r.session_count, pct(r.percentage)])
                },
                {
                    subtitle: "Prodotti più aperti",
                    headers: ["#", "Prodotto", "Aperture"],
                    rows: topViewed.map((r, i) => [i + 1, r.product_name, r.count]),
                    columnWidths: [undefined, NAME_W, undefined]
                },
                {
                    subtitle: "Prodotti più selezionati",
                    headers: ["#", "Prodotto", "Aggiunte"],
                    rows: topSelected.map((r, i) => [i + 1, r.product_name, r.count]),
                    columnWidths: [undefined, NAME_W, undefined]
                },
                {
                    subtitle: "Cosa cercano",
                    headers: ["#", "Termine", "Ricerche", "Media risultati"],
                    rows: searchTerms.map((r, i) => [i + 1, r.search_term, r.search_count, r.avg_results])
                },
                {
                    subtitle: "Contenuti in evidenza",
                    headers: ["#", "Titolo", "Posizione", "Click"],
                    rows: featuredPerf.map((r, i) => [
                        i + 1,
                        r.title,
                        SLOT_LABELS[r.slot] ?? r.slot,
                        r.click_count
                    ]),
                    columnWidths: [undefined, NAME_W, undefined, undefined]
                },
                {
                    subtitle: "Recensioni",
                    headers: ["Metrica", "Valore"],
                    rows: reviewMetrics
                        ? [
                              ["Recensioni lasciate", reviewMetrics.total],
                              ["Media stelle", reviewMetrics.avg_rating],
                              ["Redirect a Google", reviewMetrics.google_redirects]
                          ]
                        : []
                },
                {
                    subtitle: "Distribuzione stelle",
                    headers: ["Stelle", "Conteggio"],
                    rows: reviewMetrics?.distribution.map(r => [r.stars, r.count]) ?? []
                },
                {
                    subtitle: "Clic sui contatti e sui social",
                    headers: ["Piattaforma", "Click"],
                    rows: socialClicks.map(r => [r.social_type, r.click_count])
                }
            ]
        };

        const sheets: SheetSpec[] = [engagement];

        // ── Ordini (se feature attiva) ───────────────────────────────────────
        if (ordersFeature) {
            sheets.push({
                name: "Ordini",
                title: "ORDINI",
                blocks: [
                    {
                        subtitle: "Panoramica",
                        headers: ["Metrica", "Valore"],
                        rows: ordersOverview
                            ? [
                                  ["Ordini", ordersOverview.orders_count],
                                  ["Ricavi", eur(ordersOverview.revenue)],
                                  ["Valore medio ordine", eur(ordersOverview.avg_order_value)],
                                  ["Tasso annullamento", pct(ordersOverview.cancellation_rate)],
                                  ["Ordini annullati", ordersOverview.cancelled_count]
                              ]
                            : []
                    },
                    {
                        subtitle: "Andamento",
                        headers: ["Data", "Ordini", "Ricavi"],
                        rows: ordersTrend.map(r => [r.date, r.orders_count, eur(r.revenue)])
                    },
                    {
                        subtitle: "Fasce orarie",
                        headers: ["Ora", "Ordini", "Ricavi"],
                        rows: ordersHourly.map(r => [r.hour, r.orders_count, eur(r.revenue)])
                    },
                    {
                        subtitle: "Top prodotti ordinati (qtà)",
                        headers: ["#", "Prodotto", "Quantità", "Ricavi"],
                        rows: topOrderedByQty.map((r, i) => [i + 1, r.product_name, r.quantity, eur(r.revenue)]),
                        columnWidths: [undefined, NAME_W, undefined, undefined]
                    },
                    {
                        subtitle: "Top prodotti ordinati (ricavi)",
                        headers: ["#", "Prodotto", "Quantità", "Ricavi"],
                        rows: topOrderedByRevenue.map((r, i) => [i + 1, r.product_name, r.quantity, eur(r.revenue)]),
                        columnWidths: [undefined, NAME_W, undefined, undefined]
                    },
                    {
                        subtitle: "Tempi operativi",
                        headers: ["Fase", "Media", "Mediana"],
                        rows: ordersLatency
                            ? [
                                  ["Preparazione", dur(ordersLatency.avg_prep_seconds), dur(ordersLatency.median_prep_seconds)],
                                  ["Consegna", dur(ordersLatency.avg_delivery_seconds), dur(ordersLatency.median_delivery_seconds)],
                                  ["Totale", dur(ordersLatency.avg_total_seconds), dur(ordersLatency.median_total_seconds)]
                              ]
                            : []
                    },
                    {
                        subtitle: "Campione tempi operativi",
                        headers: ["Metrica", "Valore"],
                        rows: ordersLatency
                            ? [
                                  ["Ordini consegnati", ordersLatency.delivered_count],
                                  ["Consegne dirette (no 'Pronto')", ordersLatency.skipped_ready_count]
                              ]
                            : []
                    },
                    {
                        subtitle: "Dalla selezione all'ordine",
                        headers: ["Metrica", "Valore"],
                        rows: ordersConversion
                            ? [
                                  ["Visite con selezione", ordersConversion.selection_sessions],
                                  ["Ordini inviati", ordersConversion.orders_count],
                                  ["Tasso di conversione", pct(ordersConversion.conversion_rate)]
                              ]
                            : []
                    }
                ]
            });
        }

        // ── Prenotazioni (se feature attiva) ─────────────────────────────────
        if (reservationsFeature) {
            sheets.push({
                name: "Prenotazioni",
                title: "PRENOTAZIONI",
                blocks: [
                    {
                        subtitle: "Panoramica",
                        headers: ["Metrica", "Valore"],
                        rows: reservationsOverview
                            ? [
                                  ["Prenotazioni (ricevute)", reservationsOverview.reservations_count],
                                  ["Coperti", reservationsOverview.covers],
                                  ["Confermate", reservationsOverview.confirmed_count],
                                  ["Tasso conferma", pct(reservationsOverview.confirm_rate)],
                                  ["Rifiutate", reservationsOverview.declined_count],
                                  ["Annullate", reservationsOverview.cancelled_count],
                                  ["Online", reservationsOverview.online_count],
                                  ["Manuali", reservationsOverview.manual_count]
                              ]
                            : []
                    },
                    {
                        subtitle: "Andamento",
                        headers: ["Data", "Prenotazioni", "Coperti"],
                        rows: reservationsTrend.map(r => [r.date, r.reservations_count, r.covers])
                    },
                    {
                        subtitle: "Fasce orarie",
                        headers: ["Ora", "Prenotazioni"],
                        rows: reservationsHourly.map(r => [r.hour, r.reservations_count])
                    }
                ]
            });
        }

        // ── Copertina ─────────────────────────────────────────────────────────
        const activityName =
            selectedActivityId === "all"
                ? "Tutte le sedi"
                : (readableActivities.find(a => a.id === selectedActivityId)?.name ?? "Sede");

        const periodHumanLabel: Record<PeriodKey, string> = {
            today: "Oggi",
            "7d": "Ultimi 7 giorni",
            "30d": "Ultimi 30 giorni",
            "90d": "Ultimi 90 giorni",
            all: "Tutto il periodo"
        };
        const { from, to } = periodToDateRange(period);
        const dateFmt = new Intl.DateTimeFormat("it-IT", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
        const dateTimeFmt = new Intl.DateTimeFormat("it-IT", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });

        const cover: CoverSpec = {
            bannerTitle: "CataloGlobe · Analitiche",
            subtitle: activityName,
            info: [
                { label: "Periodo", value: periodHumanLabel[period] },
                // Il campione prima di ogni numero derivato (§36.1/1, A5): nel
                // foglio le percentuali restano, il lettore sa su cosa pesano.
                { label: "Campione", value: `${overviewStats?.total_views ?? 0} visite` },
                { label: "Intervallo date", value: `${dateFmt.format(from)} – ${dateFmt.format(to)}` },
                { label: "Generato il", value: dateTimeFmt.format(new Date()) },
                { label: "Valuta", value: "EUR (€)" }
            ],
            indexEntries: sheets.map(s => s.name)
        };

        const wb = buildXlsxWorkbook(cover, sheets);

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
        selectionConversion,
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
    const periodOptions = useMemo<{ value: PeriodKey; label: string }[]>(() => [
        { value: "today", label: "Oggi" },
        { value: "7d", label: "7 giorni" },
        { value: "30d", label: "30 giorni" },
        { value: "90d", label: "90 giorni" },
        { value: "all", label: "Tutto" }
    ], []);

    const leading = useMemo(() => (
        <SegmentedControl
            value={period}
            onChange={setPeriod}
            options={periodOptions}
        />
    ), [period, periodOptions, setPeriod]);

    const headerActions = useMemo(() => (
        <Button
            variant="secondary"
            leftIcon={<Download size={16} />}
            disabled={isLoading || isEmpty}
            onClick={handleExportXlsx}
            className={styles.toolbarCta}
        >
            Esporta Excel
        </Button>
    ), [isLoading, isEmpty, handleExportXlsx]);

    // Il `leading` qui è un filtro, non una navigazione: in compatto prende il
    // posto del picker sezione e mostra il periodo scelto in chiaro.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        leadingFilter: {
            label: "Periodo",
            options: periodOptions,
            value: period,
            // Default della pagina, non "nessun filtro": è il periodo con cui
            // le analitiche si aprono.
            defaultValue: DEFAULT_PERIOD,
            onChange: value => setPeriod(value as PeriodKey)
        },
        // Secondario a tutte le larghezze: la pagina si legge, l'export è
        // un di più (in compatto era diventato il bottone pieno).
        primaryAction: {
            label: "Esporta Excel",
            onClick: handleExportXlsx,
            disabled: isLoading || isEmpty,
            emphasis: "secondary"
        }
    }), [period, periodOptions, setPeriod, handleExportXlsx, isLoading, isEmpty]);

    // Periodo ed «Esporta Excel» solo a chi legge: sulla pagina bloccata la
    // testata resta vuota (#591).
    usePageHeader(canRead ? { leading, actions: headerActions, compact: headerCompact } : null);

    const periodPhrase: Record<PeriodKey, string> = {
        today: "Oggi",
        "7d": "Negli ultimi 7 giorni",
        "30d": "Negli ultimi 30 giorni",
        "90d": "Negli ultimi 90 giorni",
        all: "Da sempre"
    };
    const collapsedPhrase: Record<PeriodKey, string> = {
        today: "oggi",
        "7d": "in 7 giorni",
        "30d": "in 30 giorni",
        "90d": "in 90 giorni",
        all: "finora"
    };

    return (
        <PageGate readPermission="analytics.read" activityId={selectedActivityId === "all" ? null : selectedActivityId}>
            {() => (
                <div className={styles.analytics}>
                    {loadError ? (
                        <EmptyState
                            variant="page"
                            icon={<BarChart3 />}
                            title="Non è stato possibile caricare le analitiche"
                            description="Controlla la connessione e riprova."
                            action={
                                <Button variant="secondary" onClick={() => void loadData()}>
                                    Riprova
                                </Button>
                            }
                        />
                    ) : (
                        <>
                            {/* Ordine fisso per tipo di dato (§36.2–36.3): il
                                campione, cosa cercano, cosa guardano, le
                                recensioni, poi ordini e prenotazioni; le sezioni
                                senza dati scendono in fondo. */}
                            <SampleBand
                                visits={overviewStats?.total_views ?? 0}
                                previousVisits={previousOverviewStats?.total_views ?? null}
                                periodPhrase={periodPhrase[period]}
                                previousPeriodLabel={getPreviousPeriodLabel(period)}
                                sedeCount={scopedActivities.length}
                                isLoading={isLoading}
                            />
                            <SearchSection data={searchTerms} isLoading={isLoading} />
                            <ViewsSection
                                stats={overviewStats}
                                pageViewsTrend={pageViewsTrend}
                                topViewed={topViewed}
                                topSelected={topSelected}
                                hourly={hourlyData}
                                devices={deviceData}
                                funnel={funnelData}
                                featured={featuredPerf}
                                social={socialClicks}
                                dateRange={dateRange}
                                period={period}
                                isLoading={isLoading}
                            />
                            <ReviewsSection data={reviewMetrics} isLoading={isLoading} />
                            {ordersFeature && !isLoading && !ordersEmpty && (
                                <OrdersSection
                                    overview={ordersOverview}
                                    previous={previousOrdersOverview}
                                    trend={ordersTrend}
                                    hourly={ordersHourly}
                                    topByQuantity={topOrderedByQty}
                                    topByRevenue={topOrderedByRevenue}
                                    latency={ordersLatency}
                                    conversion={ordersConversion}
                                    dateRange={dateRange}
                                    period={period}
                                    previousPeriodLabel={getPreviousPeriodLabel(period)}
                                />
                            )}
                            {reservationsFeature && !isLoading && !reservationsEmpty && (
                                <ReservationsSection
                                    overview={reservationsOverview}
                                    previous={previousReservationsOverview}
                                    trend={reservationsTrend}
                                    hourly={reservationsHourly}
                                    dateRange={dateRange}
                                    period={period}
                                    previousPeriodLabel={getPreviousPeriodLabel(period)}
                                />
                            )}
                            <CollapsedSections
                                ordersEmpty={ordersEmpty}
                                reservationsEmpty={reservationsEmpty}
                                orderingOn={scopedActivities.filter(a => a.ordering_enabled).length}
                                reservationsOn={scopedActivities.filter(a => a.enable_reservations).length}
                                sedeCount={scopedActivities.length}
                                periodPhrase={collapsedPhrase[period]}
                            />
                        </>
                    )}
                </div>
            )}
        </PageGate>
    );
}
