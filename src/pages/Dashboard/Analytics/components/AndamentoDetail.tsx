import { useId } from "react";
import { Link } from "react-router-dom";
import { DetailPane } from "@/components/layout/DetailPane/DetailPane";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { formatPrice } from "@/utils/formatCurrency";
import { DayChart } from "./AndamentoCharts";
import { sedeColor } from "../utils/andamentoFormat";
import { SearchList } from "./SearchList";
import type { AndamentoData } from "../utils/andamentoData";
import { formatRating, lowReviews, type AndamentoRow, type SedeCompared } from "../utils/andamentoRows";
import type { DailyChart } from "../utils/andamentoSeries";
import { isBelowSample } from "../utils/periodComparison";
import styles from "../Analytics.module.scss";

const int = (n: number) => Math.round(n).toLocaleString("it-IT");

const DEVICE: Record<string, string> = { mobile: "Telefono", desktop: "Computer", tablet: "Tablet" };
const CLICK: Record<string, string> = {
    phone: "telefono",
    address: "indirizzo",
    maps: "indirizzo",
    email: "email",
    website: "sito",
    instagram: "Instagram",
    facebook: "Facebook",
    whatsapp: "WhatsApp",
    tiktok: "TikTok"
};

export function Facts({ items }: { items: [string, string][] }) {
    return (
        <dl className={styles.facts}>
            {items.map(([value, label]) => (
                <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                </div>
            ))}
        </dl>
    );
}

export function Chart({ title, chart, compare }: { title: string; chart: DailyChart; compare: readonly SedeCompared[] | null }) {
    if (chart.dates.length === 0) return null;
    return (
        <section className={styles.paneSection}>
            <h3 className={styles.kicker}>{title}</h3>
            <DayChart
                dates={chart.dates}
                series={chart.values.map((values, i) => ({ values, color: compare ? sedeColor(i) : undefined }))}
                previous={chart.previous}
                label={title}
                width={360}
                height={130}
            />
            {compare && (
                <p className={styles.legend}>
                    {compare.map((s, i) => (
                        <span key={s.id}>
                            <i style={{ background: sedeColor(i) }} aria-hidden />
                            {s.name}
                        </span>
                    ))}
                </p>
            )}
        </section>
    );
}

export interface AndamentoDetailProps {
    row: AndamentoRow | null;
    data: AndamentoData;
    chart: DailyChart | null;
    compare: readonly SedeCompared[] | null;
    paths: { storico: string | null; prenotazioni: string; recensioni: string };
    onClose: () => void;
    onPrev?: () => void;
    onNext?: () => void;
    position?: { index: number; total: number };
}

/** Il dettaglio di una riga, accanto all'elenco (D131): il grafico, i numeri, dove andare. */
export function AndamentoDetail({ row, data, chart, compare, paths, onClose, onPrev, onNext, position }: AndamentoDetailProps) {
    const titleId = useId();
    return (
        <DetailPane open={row !== null} onClose={onClose} aria-labelledby={titleId} backLabel="Andamento" onPrev={onPrev} onNext={onNext} position={position}>
            {row && (
                <DrawerLayout title={row.title} titleId={titleId} onClose={onClose}>
                    <div className={styles.paneBody}>{body(row, data, chart, compare, paths)}</div>
                </DrawerLayout>
            )}
        </DetailPane>
    );
}

function body(row: AndamentoRow, data: AndamentoData, chart: DailyChart | null, compare: readonly SedeCompared[] | null, paths: AndamentoDetailProps["paths"]) {
    switch (row.key) {
        case "pagina": {
            const visits = data.overview?.total_views ?? 0;
            const small = isBelowSample(visits);
            const last = data.funnel.length > 0 ? data.funnel[data.funnel.length - 1] : null;
            const selected = new Map(data.topSelected.map(p => [p.product_name, p.count]));
            const devices = data.devices
                .map(d => `${DEVICE[d.device_type] ?? d.device_type} ${small ? int(d.device_count) : `${Math.round(d.percentage)}%`}`)
                .join(" · ");
            const clicks = [...data.social]
                .sort((a, b) => b.click_count - a.click_count)
                .map(c => `${CLICK[c.social_type] ?? c.social_type} ${int(c.click_count)}`)
                .join(" · ");
            return (
                <>
                    {chart && <Chart title="Giorno per giorno" chart={chart} compare={compare} />}
                    <Facts
                        items={[
                            [int(visits), visits === 1 ? "visita" : "visite"],
                            [(data.overview?.avg_events_per_session ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 1 }), "cose a visita"],
                            [int(last?.session_count ?? 0), "con una scelta"]
                        ]}
                    />
                    {data.topViewed.length > 0 && (
                        <section className={styles.paneSection}>
                            <h3 className={styles.kicker}>Cosa aprono</h3>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Prodotto</th>
                                        <th>Aperti</th>
                                        <th>Scelti</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.topViewed.slice(0, 6).map(p => (
                                        <tr key={p.product_name}>
                                            <td>{p.product_name}</td>
                                            <td>{int(p.count)}</td>
                                            <td>{int(selected.get(p.product_name) ?? 0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                    )}
                    {(devices || clicks) && (
                        <section className={styles.paneSection}>
                            <h3 className={styles.kicker}>Da dove</h3>
                            {devices && <p className={styles.paneText}>{devices}</p>}
                            {clicks && <p className={styles.paneText}>Clic: {clicks}</p>}
                        </section>
                    )}
                </>
            );
        }
        case "tavolo": {
            const o = data.orders?.overview;
            const latency = data.orders?.latency;
            const minutes = (s: number | undefined) => (s ? `${Math.max(1, Math.round(s / 60))} min` : "—");
            return (
                <>
                    {chart && <Chart title="Ordini al giorno" chart={chart} compare={compare} />}
                    <Facts
                        items={[
                            [formatPrice(o?.avg_order_value ?? 0), "a ordine"],
                            [minutes(latency?.median_prep_seconds), "per preparare"],
                            [minutes(latency?.median_delivery_seconds), "per servire"]
                        ]}
                    />
                    {(data.orders?.topByQuantity.length ?? 0) > 0 && (
                        <section className={styles.paneSection}>
                            <h3 className={styles.kicker}>I più ordinati</h3>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Prodotto</th>
                                        <th>Quanti</th>
                                        <th>Incasso</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.orders?.topByQuantity.slice(0, 6).map(p => (
                                        <tr key={p.product_name}>
                                            <td>{p.product_name}</td>
                                            <td>{int(p.quantity)}</td>
                                            <td>{formatPrice(p.revenue)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                    )}
                    {paths.storico && (
                        <p className={styles.note}>
                            Gli stessi ordini dello Storico, contati.{" "}
                            <Link className={styles.rowLink} to={paths.storico}>
                                Apri lo Storico ›
                            </Link>
                        </p>
                    )}
                </>
            );
        }
        case "prenotazioni": {
            const r = data.reservations?.overview;
            const hourly = data.reservations?.hourly ?? [];
            const total = hourly.reduce((sum, h) => sum + h.reservations_count, 0);
            const evening = hourly.filter(h => h.hour >= 17).reduce((sum, h) => sum + h.reservations_count, 0);
            return (
                <>
                    {chart && <Chart title="Coperti al giorno" chart={chart} compare={compare} />}
                    <Facts
                        items={[
                            [int(r?.reservations_count ?? 0), "prenotazioni"],
                            [int(r?.confirmed_count ?? 0), "confermate"],
                            [int(r?.cancelled_count ?? 0), "annullate"]
                        ]}
                    />
                    <section className={styles.paneSection}>
                        <h3 className={styles.kicker}>Come arrivano</h3>
                        <p className={styles.paneText}>
                            Online {int(r?.online_count ?? 0)} · a mano {int(r?.manual_count ?? 0)}.
                            {total > 0 && ` Sera ${Math.round((evening / total) * 100)}%, pranzo ${100 - Math.round((evening / total) * 100)}%.`}
                        </p>
                    </section>
                    <p>
                        <Link className={styles.rowLink} to={paths.prenotazioni}>
                            Apri Prenotazioni ›
                        </Link>
                    </p>
                </>
            );
        }
        case "recensioni": {
            const m = data.reviews;
            const max = Math.max(...(m?.distribution ?? []).map(d => d.count), 1);
            return (
                <>
                    <Facts
                        items={[
                            [m && m.total > 0 ? formatRating(m.avg_rating) : "—", "voto medio"],
                            [int(m?.total ?? 0), "recensioni"],
                            [int(lowReviews(data)), "basse"]
                        ]}
                    />
                    <section className={styles.paneSection}>
                        <h3 className={styles.kicker}>Le stelle</h3>
                        <ul className={styles.stars} aria-label="Le stelle">
                            {[...(m?.distribution ?? [])]
                                .sort((a, b) => b.stars - a.stars)
                                .map(d => (
                                    <li key={d.stars} className={styles.searchRow} data-missing={d.stars <= 3 && d.count > 0 ? "" : undefined}>
                                        <span>{d.stars} ★</span>
                                        <span className={styles.track} aria-hidden>
                                            <i style={{ width: `${(d.count / max) * 100}%` }} />
                                        </span>
                                        <span className={styles.searchCount}>{d.count}</span>
                                    </li>
                                ))}
                        </ul>
                    </section>
                    <p>
                        <Link className={styles.rowLink} to={paths.recensioni}>
                            Vai alle recensioni ›
                        </Link>
                    </p>
                </>
            );
        }
        case "ricerche":
            return <SearchList terms={data.searchTerms} />;
    }
}
