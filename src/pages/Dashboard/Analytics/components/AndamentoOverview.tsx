import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { DayChart } from "./AndamentoCharts";
import { sedeColor } from "../utils/andamentoFormat";
import { Delta } from "./AndamentoRows";
import { SearchList } from "./SearchList";
import type { AndamentoData, SedeNumbers } from "../utils/andamentoData";
import { featuredLine, formatRating, type SedeCompared } from "../utils/andamentoRows";
import { SERIES_TITLE, seriesTotal, type DailyChart, type SeriesKey } from "../utils/andamentoSeries";
import { isBelowSample, type PeriodKey } from "../utils/periodComparison";
import styles from "../Analytics.module.scss";

const int = (n: number) => Math.round(n).toLocaleString("it-IT");

type LikeKey = "aperti" | "scelti" | "ordinati";

/** Cosa piace: aperti, scelti e ordinati per prodotto, in una tabella sola. */
export function LikedProducts({ data, withOrders }: { data: AndamentoData; withOrders: boolean }) {
    const [sortBy, setSortBy] = useState<LikeKey>("aperti");
    const byName = new Map<string, Record<LikeKey, number>>();
    const row = (name: string) => {
        const r = byName.get(name) ?? { aperti: 0, scelti: 0, ordinati: 0 };
        byName.set(name, r);
        return r;
    };
    for (const p of data.topViewed) row(p.product_name).aperti += p.count;
    for (const p of data.topSelected) row(p.product_name).scelti += p.count;
    if (withOrders) for (const p of data.orders?.topByQuantity ?? []) row(p.product_name).ordinati += p.quantity;
    const sorted = [...byName.entries()].sort((a, b) => b[1][sortBy] - a[1][sortBy]).slice(0, 6);
    const options: { value: LikeKey; label: string }[] = [
        { value: "aperti", label: "Aperti" },
        { value: "scelti", label: "Scelti" },
        ...(withOrders ? [{ value: "ordinati" as const, label: "Ordinati" }] : [])
    ];

    return (
        <section className={styles.box} aria-labelledby="andamento-piace">
            <div className={styles.boxHead}>
                <h3 id="andamento-piace">Cosa piace</h3>
                <SegmentedControl size="sm" value={sortBy} onChange={setSortBy} options={options} />
            </div>
            {sorted.length === 0 ? (
                <p className={styles.note}>Nessun prodotto aperto nel periodo.</p>
            ) : (
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Prodotto</th>
                            {options.map(o => (
                                <th key={o.value}>{o.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map(([name, r]) => (
                            <tr key={name}>
                                <td>{name}</td>
                                {options.map(o => (
                                    <td key={o.value}>{int(r[o.value])}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}

/**
 * Quando arrivano: una riga per cosa (visite, ordini, prenotazioni), una
 * colonna per ora, più scuro più gente. Per giorno della settimana serve una
 * funzione nuova nel database (da dire a Lorenzo).
 */
export function HoursHeat({ data }: { data: AndamentoData }) {
    const rows = [
        { label: "Visite", unit: "visite", values: new Map(data.hourly.map(h => [h.hour, h.view_count])) },
        ...(data.orders ? [{ label: "Ordini", unit: "ordini", values: new Map(data.orders.hourly.map(h => [h.hour, h.orders_count])) }] : []),
        ...(data.reservations
            ? [{ label: "Prenotazioni", unit: "prenotazioni", values: new Map(data.reservations.hourly.map(h => [h.hour, h.reservations_count])) }]
            : [])
    ].filter(r => [...r.values.values()].some(v => v > 0));
    if (rows.length === 0) return null;

    const hoursWithData = rows.flatMap(r => [...r.values.entries()].filter(([, v]) => v > 0).map(([h]) => h));
    const first = Math.min(...hoursWithData);
    const last = Math.max(...hoursWithData);
    const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    const peak = [...rows[0].values.entries()].sort((a, b) => b[1] - a[1])[0][0];

    return (
        <section className={styles.box} aria-labelledby="andamento-quando">
            <div className={styles.boxHead}>
                <h3 id="andamento-quando">Quando arrivano</h3>
            </div>
            <div className={styles.heat} style={{ gridTemplateColumns: `88px repeat(${hours.length}, minmax(0, 1fr))` }}>
                <span />
                {hours.map(h => (
                    <span key={h} className={styles.heatHour}>
                        {h}
                    </span>
                ))}
                {rows.map(r => {
                    const max = Math.max(...r.values.values(), 1);
                    return [
                        <span key={r.label} className={styles.heatLabel}>
                            {r.label}
                        </span>,
                        ...hours.map(h => {
                            const v = r.values.get(h) ?? 0;
                            return (
                                <i
                                    key={`${r.label}-${h}`}
                                    className={styles.heatCell}
                                    style={{ opacity: v === 0 ? 0.06 : 0.15 + (v / max) * 0.85 }}
                                    title={`${h}:00 · ${int(v)} ${r.unit}`}
                                />
                            );
                        })
                    ];
                })}
            </div>
            <p className={styles.note}>
                Più scuro, più gente. Il momento più pieno: {peak}–{peak + 1}.
            </p>
        </section>
    );
}

/** In breve: le cose piccole che non meritano una riga. */
export function InShort({ data, period }: { data: AndamentoData; period: PeriodKey }) {
    const visits = data.overview?.total_views ?? 0;
    const small = isBelowSample(visits);
    const mobile = data.devices.find(d => d.device_type === "mobile");
    const clicks = data.social.reduce((sum, c) => sum + c.click_count, 0);
    const last = data.funnel.length > 0 ? data.funnel[data.funnel.length - 1] : null;
    const latency = data.orders?.latency;
    const parts = [
        mobile ? (small ? `${int(mobile.device_count)} visite dal telefono` : `${Math.round(mobile.percentage)}% dal telefono`) : null,
        clicks > 0 ? `${int(clicks)} clic su contatti e social` : null,
        data.featured.length > 0 ? featuredLine(data, period).replace(/\.$/, "") : null,
        last && !small ? `${Math.round(last.percentage)} su 100 visite scelgono qualcosa` : null,
        latency && latency.delivered_count > 0
            ? `${Math.max(1, Math.round(latency.median_prep_seconds / 60))} min per preparare, ${Math.max(1, Math.round(latency.median_delivery_seconds / 60))} per servire`
            : null
    ].filter((x): x is string => x !== null);
    return (
        <section className={styles.box} aria-labelledby="andamento-breve">
            <div className={styles.boxHead}>
                <h3 id="andamento-breve">In breve</h3>
            </div>
            <p className={styles.paneText}>{parts.length > 0 ? parts.join(" · ") : "Ancora niente da dire."}</p>
        </section>
    );
}

export interface AndamentoOverviewProps {
    data: AndamentoData;
    own: SedeNumbers;
    metrics: readonly SeriesKey[];
    metric: SeriesKey;
    onMetric: (key: SeriesKey) => void;
    chart: DailyChart;
    compare: readonly SedeCompared[] | null;
    period: PeriodKey;
    withOrders: boolean;
}

/** Andamento A (D154, lo switch): una striscia di numeri, un grafico, poi i dettagli. */
export function AndamentoOverview({ data, own, metrics, metric, onMetric, chart, compare, period, withOrders }: AndamentoOverviewProps) {
    const others = compare ? compare.slice(1) : [];
    const rating = data.reviews && data.reviews.total > 0 ? data.reviews.avg_rating : null;
    const title = SERIES_TITLE[metric];

    return (
        <>
            <div className={styles.card}>
                <div className={styles.strip} role="group" aria-label="Cosa mostra il grafico">
                    {metrics.map(key => {
                        const total = seriesTotal(key, own);
                        return (
                            <button key={key} type="button" className={styles.stripCell} aria-pressed={metric === key} onClick={() => onMetric(key)}>
                                <span className={styles.stripLabel}>{SERIES_TITLE[key]}</span>
                                <span className={styles.stripValue}>{total.label}</span>
                                <span className={styles.stripDelta}>
                                    <Delta value={total.delta} />
                                </span>
                                {others.map((s, i) => (
                                    <span key={s.id} className={styles.stripOther}>
                                        <i style={{ background: sedeColor(i + 1) }} aria-hidden />
                                        {s.name} {seriesTotal(key, s.numbers).label}
                                    </span>
                                ))}
                            </button>
                        );
                    })}
                    <div className={styles.stripCell}>
                        <span className={styles.stripLabel}>Voto medio</span>
                        <span className={styles.stripValue}>{rating === null ? "—" : formatRating(rating)}</span>
                        <span className={styles.stripDelta}>
                            {data.reviews?.total ?? 0} {data.reviews?.total === 1 ? "recensione" : "recensioni"}
                        </span>
                        {others.map((s, i) => (
                            <span key={s.id} className={styles.stripOther}>
                                <i style={{ background: sedeColor(i + 1) }} aria-hidden />
                                {s.name} {s.numbers.rating === null ? "—" : formatRating(s.numbers.rating)}
                            </span>
                        ))}
                    </div>
                </div>
                <div className={styles.chartBox}>
                    <div className={styles.boxHead}>
                        <h3>{title}, giorno per giorno</h3>
                        <p className={styles.legend}>
                            {compare ? (
                                compare.map((s, i) => (
                                    <span key={s.id}>
                                        <i style={{ background: sedeColor(i) }} aria-hidden />
                                        {s.name}
                                    </span>
                                ))
                            ) : (
                                <>
                                    <span>
                                        <i style={{ background: sedeColor(0) }} aria-hidden />
                                        questo periodo
                                    </span>
                                    {chart.previous && <span className={styles.legendDashed}>il periodo prima</span>}
                                </>
                            )}
                        </p>
                    </div>
                    {chart.dates.length > 0 ? (
                        <DayChart
                            dates={chart.dates}
                            series={chart.values.map((values, i) => ({ values, color: compare ? sedeColor(i) : undefined }))}
                            previous={chart.previous}
                            label={`${title}, giorno per giorno`}
                            width={1120}
                            height={220}
                        />
                    ) : (
                        <p className={styles.note}>Nessun dato nel periodo.</p>
                    )}
                </div>
            </div>
            <div className={styles.two}>
                <LikedProducts data={data} withOrders={withOrders} />
                <HoursHeat data={data} />
            </div>
            <div className={styles.two}>
                {data.searchTerms.length > 0 && (
                    <section className={styles.box} aria-labelledby="andamento-cercano">
                        <div className={styles.boxHead}>
                            <h3 id="andamento-cercano">Cosa cercano</h3>
                        </div>
                        <SearchList terms={data.searchTerms} />
                    </section>
                )}
                <InShort data={data} period={period} />
            </div>
        </>
    );
}
