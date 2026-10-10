import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ChartColumn, Download } from "lucide-react";
import { useTenantId } from "@/context/useTenantId";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnActivity, canDoOnAnyActivity } from "@/lib/permissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { PageGate } from "@/components/PageGate/PageGate";
import { Button } from "@/components/ui/Button/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { useSedeScope } from "@/hooks/useSedeScope";
import { useSediVista, useConfrontoQui } from "@/hooks/useSediVista";
import { useDetailParam } from "@/hooks/useDetailParam";
import { PERIOD_OPTIONS, usePeriodParam } from "@/hooks/usePeriodParam";
import { loadAndamento, loadSedeNumbers, sedeNumbersOf, type AndamentoData, type SedeNumbers } from "./utils/andamentoData";
import { andamentoSentence, buildRows, compareSentence, featuredLine, type RowKey, type SedeCompared } from "./utils/andamentoRows";
import { SERIES_OF_ROW, dailyChart, type SeriesKey } from "./utils/andamentoSeries";
import { exportAndamentoXlsx } from "./utils/exportAndamento";
import { DEFAULT_PERIOD, periodToDateRange } from "./utils/periodComparison";
import { AndamentoRows } from "./components/AndamentoRows";
import { AndamentoDetail } from "./components/AndamentoDetail";
import { AndamentoOverview } from "./components/AndamentoOverview";
import styles from "./Analytics.module.scss";

type View = "righe" | "grafico";
const VIEW_KEY = "andamento_view";
const VIEW_OPTIONS: { value: View; label: string }[] = [
    { value: "righe", label: "Righe" },
    { value: "grafico", label: "Grafico" }
];

function readView(): View {
    try {
        return localStorage.getItem(VIEW_KEY) === "grafico" ? "grafico" : "righe";
    } catch {
        return "righe";
    }
}

/**
 * Andamento (D154, B con lo switch per A): una frase che dice come va, poi
 * una riga per cosa con il dettaglio accanto; «Grafico» mostra gli stessi
 * numeri come striscia e grafico giorno per giorno. Il periodo vive
 * nell'indirizzo; il confronto con altre sedi viene da «Confronta con» in alto.
 */
export default function AnalyticsPage() {
    const tenantId = useTenantId();
    const { permissions } = usePermissions();
    const { businessId = "", activityId: routeActivityId } = useParams<{ businessId: string; activityId?: string }>();
    const { readableActivities } = useSedeScope();
    // Due livelli (§51.10): dentro la sede la sede è nel path; fuori è il
    // totale delle sedi leggibili.
    const activityId = routeActivityId ?? undefined;
    // Gate di lettura prima di ogni fetch (#590): lo stesso che rende `PageGate`.
    const canRead =
        permissions != null &&
        (activityId ? canDoOnActivity(permissions, "analytics.read", activityId) : canDoOnAnyActivity(permissions, "analytics.read"));

    const [period, setPeriod] = usePeriodParam();
    const { hasFeature } = usePlanFeatures();
    const ordersFeature = hasFeature("table_ordering");
    const reservationsFeature = hasFeature("table_reservation");

    const [data, setData] = useState<AndamentoData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

    // Cambiando periodo in fretta le risposte possono arrivare fuori ordine:
    // vale solo l'ultima richiesta partita.
    const requestRef = useRef(0);
    const loadData = useCallback(async () => {
        if (!tenantId || !canRead) return;
        const requestId = ++requestRef.current;
        setIsLoading(true);
        setLoadError(false);
        try {
            const next = await loadAndamento(tenantId, period, activityId, { orders: ordersFeature, reservations: reservationsFeature });
            if (requestId !== requestRef.current) return;
            setData(next);
        } catch (error) {
            if (requestId !== requestRef.current) return;
            // Un errore non lascia a schermo i dati del periodo prima: la
            // pagina lo dice, con «Riprova».
            console.error("Caricamento andamento:", error);
            setLoadError(true);
        } finally {
            if (requestId === requestRef.current) setIsLoading(false);
        }
    }, [tenantId, canRead, period, activityId, ordersFeature, reservationsFeature]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    // ── Confronto con altre sedi (D152) ─────────────────────────────────
    useConfrontoQui();
    const vista = useSediVista(tenantId);
    const compareIds = useMemo(
        () =>
            vista.confrontoAttivo && activityId
                ? readableActivities.filter(a => a.id !== activityId && vista.confronta.has(a.id)).map(a => a.id)
                : [],
        [vista.confrontoAttivo, vista.confronta, activityId, readableActivities]
    );
    const [others, setOthers] = useState<Record<string, SedeNumbers>>({});
    const compareRef = useRef(0);
    const compareKey = compareIds.join(",");
    useEffect(() => {
        const ids = compareKey ? compareKey.split(",") : [];
        if (!tenantId || !canRead || ids.length === 0) return;
        const requestId = ++compareRef.current;
        Promise.all(ids.map(id => loadSedeNumbers(tenantId, period, id, { orders: ordersFeature, reservations: reservationsFeature })))
            .then(list => {
                if (requestId === compareRef.current) setOthers(Object.fromEntries(ids.map((id, i) => [id, list[i]])));
            })
            .catch(error => console.error("Caricamento confronto:", error));
    }, [compareKey, tenantId, canRead, period, ordersFeature, reservationsFeature]);

    const own = useMemo(() => (data ? sedeNumbersOf(data) : null), [data]);
    const compare = useMemo<SedeCompared[] | null>(() => {
        if (!own || !activityId || compareIds.length === 0) return null;
        const name = (id: string) => readableActivities.find(a => a.id === id)?.name ?? "Sede";
        const loaded = compareIds.filter(id => others[id]).map(id => ({ id, name: name(id), numbers: others[id] }));
        return loaded.length > 0 ? [{ id: activityId, name: name(activityId), numbers: own }, ...loaded] : null;
    }, [own, activityId, compareIds, others, readableActivities]);

    // ── Righe, frase e grafici ───────────────────────────────────────────
    const scoped = useMemo(
        () => (activityId ? readableActivities.filter(a => a.id === activityId) : readableActivities),
        [readableActivities, activityId]
    );
    const base = activityId ? `/business/${businessId}/locations/${activityId}` : `/business/${businessId}`;
    const periodSearch = period === DEFAULT_PERIOD ? "" : `?period=${period}`;
    const paths = useMemo(
        () => ({
            sedi: `/business/${businessId}/locations`,
            prenotazioni: activityId ? `${base}/prenotazioni` : `/business/${businessId}/reservations`,
            recensioni: `${activityId ? `${base}/recensioni` : `/business/${businessId}/reviews`}${periodSearch}`,
            storico: activityId ? `${base}/storico` : null,
            featured: `/business/${businessId}/featured`
        }),
        [businessId, activityId, base, periodSearch]
    );

    const rows = useMemo(
        () =>
            data
                ? buildRows(data, {
                      period,
                      ordersFeature,
                      reservationsFeature,
                      sedeCount: scoped.length,
                      orderingOn: scoped.filter(a => a.ordering_enabled).length,
                      reservationsOn: scoped.filter(a => a.enable_reservations).length,
                      paths
                  })
                : [],
        [data, period, ordersFeature, reservationsFeature, scoped, paths]
    );
    const sentence = useMemo(
        () => (data ? (compare ? compareSentence(compare, period) : andamentoSentence(data, { period, ordersFeature, reservationsFeature })) : null),
        [data, compare, period, ordersFeature, reservationsFeature]
    );
    const range = useMemo(() => periodToDateRange(period), [period]);
    const chartOf = useCallback(
        (key: SeriesKey) => (data && own ? dailyChart(key, own, data, compare, range, period) : null),
        [data, own, compare, range, period]
    );
    const sparks = useMemo(() => {
        const out: Partial<Record<RowKey, number[]>> = {};
        if (!data || !own) return out;
        for (const row of rows) {
            const key = SERIES_OF_ROW[row.key];
            if (key) out[row.key] = dailyChart(key, own, data, null, range, period).values[0] ?? [];
        }
        return out;
    }, [rows, data, own, range, period]);

    // ── Il dettaglio accanto (D131), con ↑ ↓ fra le righe con dati ────────
    const [openKey, openRow, closeRow] = useDetailParam("voce");
    const navigable = rows.filter(r => !r.empty);
    const openIndex = navigable.findIndex(r => r.key === openKey);
    const openRowData = openIndex >= 0 ? navigable[openIndex] : null;
    const openSeries = openRowData ? SERIES_OF_ROW[openRowData.key] : undefined;

    // ── Vista: righe (B) o grafico (A) ──────────────────────────────────
    const [view, setViewState] = useState<View>(readView);
    const setView = (next: View) => {
        setViewState(next);
        try {
            localStorage.setItem(VIEW_KEY, next);
        } catch {
            // Senza memoria del browser la scelta vale finché si resta qui.
        }
    };
    const metrics = useMemo<SeriesKey[]>(
        () => ["visite", ...(ordersFeature ? (["ordini", "incasso"] as const) : []), ...(reservationsFeature ? (["coperti"] as const) : [])],
        [ordersFeature, reservationsFeature]
    );
    const [metric, setMetric] = useState<SeriesKey>("visite");
    const shownMetric = metrics.includes(metric) ? metric : "visite";

    const isEmpty = !data || navigable.length === 0;
    const handleExport = () => {
        if (!data) return;
        const sede = activityId ? readableActivities.find(a => a.id === activityId) : null;
        exportAndamentoXlsx(data, period, {
            activityName: activityId ? (sede?.name ?? "Sede") : "Tutte le sedi",
            sedeSlug: activityId ? (sede?.slug ?? activityId) : "tutte-le-sedi"
        });
    };

    return (
        <PageGate readPermission="analytics.read" activityId={activityId ?? null}>
            {() => (
                <div className={styles.andamento}>
                    {loadError ? (
                        <EmptyState
                            variant="page"
                            icon={<ChartColumn />}
                            title="Non è stato possibile caricare l'andamento"
                            description="Controlla la connessione e riprova."
                            action={
                                <Button variant="secondary" onClick={() => void loadData()}>
                                    Riprova
                                </Button>
                            }
                        />
                    ) : (
                        <>
                            <div className={styles.bar}>
                                <SegmentedControl value={period} onChange={setPeriod} options={PERIOD_OPTIONS} size="sm" />
                                <div className={styles.barEnd}>
                                    <SegmentedControl value={view} onChange={setView} options={VIEW_OPTIONS} size="sm" />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        leftIcon={<Download size={16} aria-hidden />}
                                        disabled={isLoading || isEmpty}
                                        onClick={handleExport}
                                    >
                                        Esporta
                                    </Button>
                                </div>
                            </div>

                            {!data || !sentence ? (
                                <div className={styles.loading} aria-busy="true" aria-label="Carico l'andamento">
                                    <Skeleton width="60%" height={26} />
                                    <Skeleton width="100%" height={240} radius="var(--radius-lg)" />
                                </div>
                            ) : (
                                <>
                                    <p className={styles.answer} aria-live="polite" data-loading={isLoading ? "" : undefined}>
                                        {sentence.lead}
                                        <small>{sentence.detail}</small>
                                    </p>
                                    {view === "righe" ? (
                                        <AndamentoRows
                                            rows={rows}
                                            series={sparks}
                                            compare={compare}
                                            selected={openRowData?.key ?? null}
                                            onOpen={openRow}
                                            featured={{ text: featuredLine(data, period), to: paths.featured }}
                                        />
                                    ) : (
                                        own && (
                                            <AndamentoOverview
                                                data={data}
                                                own={own}
                                                metrics={metrics}
                                                metric={shownMetric}
                                                onMetric={setMetric}
                                                chart={chartOf(shownMetric) ?? { dates: [], values: [], previous: null }}
                                                compare={compare}
                                                period={period}
                                                withOrders={ordersFeature}
                                            />
                                        )
                                    )}
                                </>
                            )}

                            {data && (
                                <AndamentoDetail
                                    row={view === "righe" ? openRowData : null}
                                    data={data}
                                    chart={openSeries ? chartOf(openSeries) : null}
                                    compare={compare}
                                    paths={paths}
                                    onClose={closeRow}
                                    onPrev={openIndex > 0 ? () => openRow(navigable[openIndex - 1].key) : undefined}
                                    onNext={openIndex >= 0 && openIndex < navigable.length - 1 ? () => openRow(navigable[openIndex + 1].key) : undefined}
                                    position={openIndex >= 0 ? { index: openIndex, total: navigable.length } : undefined}
                                />
                            )}
                        </>
                    )}
                </div>
            )}
        </PageGate>
    );
}
