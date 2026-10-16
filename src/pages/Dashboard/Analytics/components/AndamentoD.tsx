import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { formatPrice } from "@/utils/formatCurrency";
import { DayChart, Sparkline } from "./AndamentoCharts";
import { CompareBars } from "./AndamentoRows";
import { ROW_ICONS } from "../utils/andamentoIcons";
import { sedeColor } from "../utils/andamentoFormat";
import type { AndamentoData } from "../utils/andamentoData";
import { compareValue, formatDelta, formatRating, lowReviews, type AndamentoRow, type AnswerPart, type RowKey, type SedeCompared } from "../utils/andamentoRows";
import type { DailyChart } from "../utils/andamentoSeries";
import { isBelowSample, type PeriodKey } from "../utils/periodComparison";
import styles from "./AndamentoD.module.scss";

/**
 * Andamento nella direzione D (artifact v28, `#p-and`): una vista sola. In
 * alto la frase e i comandi, poi le cinque voci in riga; sotto, per la voce
 * scelta, il grafico coi numeri e il dettaglio, e accanto «Quando arrivano» e
 * «In breve». Stessi dati e stessi calcoli della vista di oggi.
 */

const int = (n: number) => Math.round(n).toLocaleString("it-IT");
const pct = (n: number) => `${Math.round(n)}%`;

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

/** «per ora del giorno», «giorno per giorno»…: l'unità del grafico. */
const UNIT: Record<PeriodKey, string> = {
    today: "ora per ora",
    "7d": "giorno per giorno",
    "30d": "giorno per giorno",
    "90d": "giorno per giorno",
    all: "giorno per giorno"
};

/** La frase con «meglio» e «peggio» evidenziati, come nella v28. */
export function Lead({ text }: { text: string }) {
    const parts = text.split(/(meglio|peggio)/);
    return (
        <>
            {parts.map((p, i) =>
                p === "meglio" ? (
                    <b key={i}>{p}</b>
                ) : p === "peggio" ? (
                    <b key={i} className={styles.down}>
                        {p}
                    </b>
                ) : (
                    p
                )
            )}
        </>
    );
}

export function Delta({ value }: { value: number | null }) {
    if (value === null) return null;
    const r = Math.round(value);
    return (
        <em className={styles.dl} data-trend={r > 0 ? "up" : r < 0 ? "down" : "same"}>
            {formatDelta(value)}
        </em>
    );
}

export function Answer({ parts }: { parts: readonly AnswerPart[] }) {
    return (
        <>
            {parts.map((p, i) => (p.strong ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>))}
        </>
    );
}

export function Facts({ items }: { items: [string, string][] }) {
    return (
        <dl className={styles.facts}>
            {items.map(([value, label]) => (
                <div key={label} className={styles.f3}>
                    <dd>{value}</dd>
                    <dt>{label}</dt>
                </div>
            ))}
        </dl>
    );
}

/** Una barra di avanzamento piena fino a `share` (0-1). */
export function Track({ share, warn, index = 0 }: { share: number; warn?: boolean; index?: number }) {
    return (
        <span className={styles.tb} data-warn={warn ? "" : undefined} aria-hidden>
            <i style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, animationDelay: `${index * 60}ms` }} />
        </span>
    );
}

/** Due parti di un tutto, come «Telefono 68% · Computer 30%». */
export function Split({ a, b }: { a: { label: string; value: number }; b: { label: string; value: number } }) {
    const total = a.value + b.value;
    if (total <= 0) return null;
    const share = (v: number) => Math.round((v / total) * 100);
    return (
        <div className={styles.splitBox}>
            <div className={styles.split} aria-hidden>
                <i style={{ flexGrow: a.value }} />
                <i style={{ flexGrow: b.value }} />
            </div>
            <div className={styles.splitlb}>
                <span>
                    {a.label} <b>{share(a.value)}%</b>
                </span>
                <span>
                    {b.label} <b>{share(b.value)}%</b>
                </span>
            </div>
        </div>
    );
}

export function Table({ head, rows }: { head: [string, string, string]; rows: [string, string, string][] }) {
    return (
        <div className={styles.tw}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        {head.map(h => (
                            <th key={h}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r[0]}>
                            {r.map((c, i) => (
                                <td key={i}>{c}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── Le voci ─────────────────────────────────────────────────────────

interface VoicesProps {
    rows: readonly AndamentoRow[];
    series: Partial<Record<RowKey, number[]>>;
    compare: readonly SedeCompared[] | null;
    selected: RowKey | null;
    onSelect: (key: RowKey) => void;
}

export function Voices({ rows, series, compare, selected, onSelect }: VoicesProps) {
    return (
        <div className={`${styles.voices} ${styles.rise} ${styles.k3}`} role="group" aria-label="Le voci dell'andamento">
            {rows.map(row => {
                const Icon = ROW_ICONS[row.key];
                const title = (
                    <span className={styles.vt}>
                        <Icon aria-hidden />
                        {row.title}
                    </span>
                );
                if (row.empty) {
                    return (
                        <div key={row.key} className={styles.vrow} data-empty="">
                            {title}
                            <span className={styles.vx}>{row.empty.text}</span>
                            <span className={styles.vk}>
                                <b>{row.short.value}</b>
                                <small>{row.short.label}</small>
                            </span>
                            {row.empty.action && (
                                <Link className={styles.lnk} to={row.empty.action.to}>
                                    {row.empty.action.label} ›
                                </Link>
                            )}
                        </div>
                    );
                }
                const comparing = compare !== null && row.key !== "ricerche";
                const spark = series[row.key];
                const lead = comparing ? leader(row.key, compare) : null;
                return (
                    <button
                        key={row.key}
                        type="button"
                        className={styles.vrow}
                        aria-pressed={selected === row.key}
                        onClick={() => onSelect(row.key)}
                    >
                        {title}
                        {comparing ? (
                            <CompareBars rowKey={row.key} sedi={compare} />
                        ) : (
                            <>
                                <span className={styles.va}>
                                    <Answer parts={row.answer} /> <Delta value={row.delta} />
                                </span>
                                {row.extras.length > 0 && <span className={styles.vx}>{row.extras.join(" · ")}</span>}
                                {spark && spark.length > 1 && (
                                    <span className={styles.spark}>
                                        <Sparkline values={spark} width={92} height={36} />
                                    </span>
                                )}
                            </>
                        )}
                        {/* tablet e telefono: solo il numero (Visual Redesign 2, `.vk`) */}
                        <span className={styles.vk}>
                            {comparing ? (
                                lead ? (
                                    <>
                                        <b>{lead.label}</b>
                                        <small>{lead.name} in testa</small>
                                    </>
                                ) : (
                                    // a zero o alla pari: un trattino, la riga non resta vuota
                                    <>
                                        <b>—</b>
                                        <small>nessuno in testa</small>
                                    </>
                                )
                            ) : (
                                <>
                                    <b>{row.short.value}</b>
                                    <Delta value={row.delta} />
                                    <small>{row.short.label}</small>
                                </>
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/** Con più sedi a confronto, nella voce compatta: chi va meglio; nessuno se sono a zero o alla pari. */
function leader(key: RowKey, sedi: readonly SedeCompared[]): { label: string; name: string } | null {
    let best: { label: string; name: string; value: number } | null = null;
    for (const s of sedi) {
        const v = compareValue(key, s.numbers);
        if (v && (!best || v.value > best.value)) best = { label: v.label, name: s.name, value: v.value };
    }
    // a zero o alla pari nessuno è in testa
    if (!best || best.value <= 0) return null;
    const top = best.value;
    if (sedi.filter(s => compareValue(key, s.numbers)?.value === top).length > 1) return null;
    return best;
}

// ── Il dettaglio della voce scelta ───────────────────────────────────

interface DetailProps {
    row: AndamentoRow;
    data: AndamentoData;
    chart: DailyChart | null;
    compare: readonly SedeCompared[] | null;
    period: PeriodKey;
    paths: { storico: string | null; prenotazioni: string; recensioni: string };
}

export function ChartCard({ title, sub, chart, compare, children }: { title: string; sub: string; chart: DailyChart | null; compare: readonly SedeCompared[] | null; children?: ReactNode }) {
    const withPrevious = !compare && !!chart?.previous?.length;
    return (
        <div className={`${styles.card} ${styles.rise} ${styles.k4}`}>
            <div className={styles.hd}>
                <h3>{title}</h3>
                <span>{sub}</span>
                {(compare || withPrevious) && (
                    <span className={styles.legend}>
                        {compare ? (
                            compare.map((s, i) => (
                                <span key={s.id}>
                                    <i style={{ borderTopColor: sedeColor(i) }} />
                                    {s.name}
                                </span>
                            ))
                        ) : (
                            <>
                                <span>
                                    <i />
                                    questo periodo
                                </span>
                                <span>
                                    <i className={styles.pv} />
                                    il periodo prima
                                </span>
                            </>
                        )}
                    </span>
                )}
            </div>
            {chart && chart.dates.length > 0 && (
                <div className={styles.chart}>
                    <DayChart
                        dates={chart.dates}
                        series={chart.values.map((values, i) => ({ values, color: compare ? sedeColor(i) : undefined }))}
                        previous={chart.previous}
                        label={`${title}, ${sub}`}
                        width={500}
                        height={200}
                    />
                </div>
            )}
            {children}
        </div>
    );
}

export function SideCard({ children }: { children: ReactNode }) {
    return <div className={`${styles.card} ${styles.rise} ${styles.k5}`}>{children}</div>;
}

type PageTab = "aprono" | "percorso" | "dove";
type OrdersBy = "quantita" | "incasso";

export function PageSide({ data }: { data: AndamentoData }) {
    const [tab, setTab] = useState<PageTab>("aprono");
    const visits = data.overview?.total_views ?? 0;
    const small = isBelowSample(visits);
    const selected = new Map(data.topSelected.map(p => [p.product_name, p.count]));
    const mobile = data.devices.find(d => d.device_type === "mobile");
    const desktop = data.devices.filter(d => d.device_type !== "mobile").reduce((sum, d) => sum + d.device_count, 0);
    const clicks = [...data.social]
        .sort((a, b) => b.click_count - a.click_count)
        .map(c => `${CLICK[c.social_type] ?? c.social_type} ${int(c.click_count)}`)
        .join(" · ");
    const firstStep = data.funnel[0]?.session_count ?? 0;
    const lastStep = data.funnel.length > 0 ? data.funnel[data.funnel.length - 1] : null;
    return (
        <SideCard>
            <div className={styles.hd}>
                <SegmentedControl<PageTab>
                    label="Cosa guardi della pagina"
                    size="sm"
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: "aprono", label: "Cosa aprono" },
                        { value: "percorso", label: "Il percorso" },
                        { value: "dove", label: "Da dove" }
                    ]}
                />
            </div>
            {tab === "aprono" &&
                (data.topViewed.length > 0 ? (
                    <Table
                        head={["Prodotto", "Aperti", "Scelti"]}
                        rows={data.topViewed.slice(0, 5).map(p => [p.product_name, int(p.count), int(selected.get(p.product_name) ?? 0)])}
                    />
                ) : (
                    <p className={styles.cap}>Nessun prodotto aperto nel periodo.</p>
                ))}
            {tab === "percorso" &&
                (data.funnel.length > 0 ? (
                    <>
                        <div className={styles.funnel}>
                            {data.funnel.map((step, i) => (
                                <div key={step.step_name} className={styles.fn}>
                                    <span>{step.step_label}</span>
                                    <b>{small ? int(step.session_count) : pct(step.percentage)}</b>
                                    <Track share={firstStep > 0 ? step.session_count / firstStep : 0} index={i} />
                                </div>
                            ))}
                        </div>
                        {lastStep && !small && (
                            <p className={styles.cap}>
                                Su 10 persone che aprono la pagina, {Math.round(lastStep.percentage / 10)} {lastStep.step_label.toLowerCase()}.
                            </p>
                        )}
                    </>
                ) : (
                    <p className={styles.cap}>Ancora nessun percorso nel periodo.</p>
                ))}
            {tab === "dove" && (
                <>
                    {mobile ? (
                        <Split a={{ label: DEVICE.mobile, value: mobile.device_count }} b={{ label: DEVICE.desktop, value: desktop }} />
                    ) : (
                        <p className={styles.cap}>Ancora nessuna visita nel periodo.</p>
                    )}
                    {clicks && <p className={styles.cap}>Clic: {clicks}</p>}
                </>
            )}
        </SideCard>
    );
}

export function OrdersSide({ data, storico }: { data: AndamentoData; storico: string | null }) {
    const [by, setBy] = useState<OrdersBy>("quantita");
    const list = (by === "quantita" ? data.orders?.topByQuantity : data.orders?.topByRevenue) ?? [];
    return (
        <SideCard>
            <div className={styles.hd}>
                <h3>I più ordinati</h3>
                <span className={styles.sp}>
                    <SegmentedControl<OrdersBy>
                        label="Ordina i prodotti"
                        size="sm"
                        value={by}
                        onChange={setBy}
                        options={[
                            { value: "quantita", label: "Quantità" },
                            { value: "incasso", label: "Incasso" }
                        ]}
                    />
                </span>
            </div>
            {list.length > 0 ? (
                <Table head={["Prodotto", "Quanti", "Incasso"]} rows={list.slice(0, 5).map(p => [p.product_name, int(p.quantity), formatPrice(p.revenue)])} />
            ) : (
                <p className={styles.cap}>Nessun ordine nel periodo.</p>
            )}
            {storico && (
                <p className={styles.cap}>
                    Gli stessi ordini dello Storico, contati.{" "}
                    <Link className={styles.lnk} to={storico}>
                        Apri lo Storico ›
                    </Link>
                </p>
            )}
        </SideCard>
    );
}

export function Detail({ row, data, chart, compare, period, paths }: DetailProps) {
    const unit = UNIT[period];
    switch (row.key) {
        case "pagina": {
            const visits = data.overview?.total_views ?? 0;
            const last = data.funnel.length > 0 ? data.funnel[data.funnel.length - 1] : null;
            return (
                <>
                    <ChartCard title="La pagina" sub={`Visite, ${unit}`} chart={chart} compare={compare}>
                        <Facts
                            items={[
                                [int(visits), visits === 1 ? "visita" : "visite"],
                                [int(data.overview?.unique_sessions ?? 0), "visitatori"],
                                [(data.overview?.avg_events_per_session ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 1 }), "cose a visita"],
                                [int(last?.session_count ?? 0), "con una scelta"]
                            ]}
                        />
                    </ChartCard>
                    <PageSide data={data} />
                </>
            );
        }
        case "tavolo": {
            const o = data.orders?.overview;
            const latency = data.orders?.latency;
            const minutes = (s: number | undefined) => (s ? `${Math.max(1, Math.round(s / 60))} min` : "—");
            return (
                <>
                    <ChartCard title="Al tavolo" sub="Ordini al giorno" chart={chart} compare={compare}>
                        <Facts
                            items={[
                                [formatPrice(o?.avg_order_value ?? 0), "a ordine"],
                                [minutes(latency?.median_prep_seconds), "per preparare"],
                                [minutes(latency?.median_delivery_seconds), "per servire"]
                            ]}
                        />
                    </ChartCard>
                    <OrdersSide data={data} storico={paths.storico} />
                </>
            );
        }
        case "prenotazioni": {
            const r = data.reservations?.overview;
            const hourly = data.reservations?.hourly ?? [];
            const evening = hourly.filter(h => h.hour >= 17).reduce((sum, h) => sum + h.reservations_count, 0);
            const lunch = hourly.filter(h => h.hour < 17).reduce((sum, h) => sum + h.reservations_count, 0);
            return (
                <>
                    <ChartCard title="Prenotazioni" sub="Coperti al giorno" chart={chart} compare={compare}>
                        <Facts
                            items={[
                                [int(r?.reservations_count ?? 0), "prenotazioni"],
                                [int(r?.confirmed_count ?? 0), "confermate"],
                                [int(r?.cancelled_count ?? 0), "annullate"]
                            ]}
                        />
                    </ChartCard>
                    <SideCard>
                        <div className={styles.hd}>
                            <h3>Come arrivano</h3>
                        </div>
                        <Split a={{ label: "Online", value: r?.online_count ?? 0 }} b={{ label: "A mano", value: r?.manual_count ?? 0 }} />
                        <Split a={{ label: "Sera", value: evening }} b={{ label: "Pranzo", value: lunch }} />
                        <p className={styles.cap}>
                            <Link className={styles.lnk} to={paths.prenotazioni}>
                                Apri Prenotazioni ›
                            </Link>
                        </p>
                    </SideCard>
                </>
            );
        }
        case "recensioni": {
            const m = data.reviews;
            const total = m?.total ?? 0;
            const stars = [...(m?.distribution ?? [])].sort((a, b) => b.stars - a.stars);
            const max = Math.max(...stars.map(d => d.count), 1);
            return (
                <>
                    <ChartCard title="Recensioni" sub={`su ${int(total)} ${total === 1 ? "recensione" : "recensioni"}`} chart={null} compare={null}>
                        <Facts
                            items={[
                                [total > 0 ? formatRating(m?.avg_rating ?? 0) : "—", "voto medio"],
                                [int(total), "recensioni"],
                                [int(lowReviews(data)), "basse"]
                            ]}
                        />
                    </ChartCard>
                    <SideCard>
                        <div className={styles.hd}>
                            <h3>Le stelle</h3>
                        </div>
                        <div className={styles.funnel} role="list" aria-label="Le stelle">
                            {stars.map((d, i) => (
                                <div key={d.stars} className={styles.fn} role="listitem">
                                    <span>{d.stars} ★</span>
                                    <b>{int(d.count)}</b>
                                    <Track share={d.count / max} warn={d.stars <= 3} index={i} />
                                </div>
                            ))}
                        </div>
                        <p className={styles.cap}>
                            <Link className={styles.lnk} to={paths.recensioni}>
                                Vai alle recensioni ›
                            </Link>
                        </p>
                    </SideCard>
                </>
            );
        }
        case "ricerche": {
            const sorted = [...data.searchTerms].sort((a, b) => b.search_count - a.search_count).slice(0, 8);
            const max = Math.max(...sorted.map(t => t.search_count), 1);
            const notFound = sorted.filter(t => t.avg_results === 0);
            return (
                <div className={`${styles.card} ${styles.rise} ${styles.k4} ${styles.wide}`}>
                    <div className={styles.hd}>
                        <h3>Cosa cercano</h3>
                        <span>ricerche nel menù</span>
                    </div>
                    <ul className={styles.terms} aria-label="Cosa cercano">
                        {sorted.map((t, i) => (
                            <li key={t.search_term}>
                                <span>
                                    {t.search_term}
                                    {t.avg_results === 0 && <em className={styles.tagWarn}>non trovato</em>}
                                </span>
                                <b>{int(t.search_count)}</b>
                                <Track share={t.search_count / max} warn={t.avg_results === 0} index={i} />
                            </li>
                        ))}
                    </ul>
                    {notFound.length > 0 && (
                        <p className={styles.cap}>
                            {notFound.map(t => `«${t.search_term}»`).join(", ")} {notFound.length === 1 ? "non trova" : "non trovano"} niente nel menù: forse
                            manca un piatto, o una parola nella descrizione.
                        </p>
                    )}
                </div>
            );
        }
    }
}

// ── La colonna a destra ─────────────────────────────────────────────

export function Heat({ data }: { data: AndamentoData }) {
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
    // l'ora più piena di ogni riga: Visite, Ordini e Prenotazioni non hanno la stessa
    const peaks = rows.map(r => ({ label: r.label, hour: [...r.values.entries()].sort((a, b) => b[1] - a[1])[0][0] }));
    const fullest =
        peaks.length === 1
            ? `${peaks[0].hour}–${peaks[0].hour + 1}`
            : peaks.map(p => `${p.label.toLowerCase()} ${p.hour}–${p.hour + 1}`).join(", ");
    let cell = 0;
    return (
        <div className={`${styles.card} ${styles.rise} ${styles.k6}`}>
            <div className={styles.hd}>
                <h3>Quando arrivano</h3>
                <span>per ora del giorno</span>
            </div>
            {/* le celle sono solo colore: chi legge con lo screen reader ha la tabella qui sotto */}
            <div
                className={styles.heat}
                style={{ gridTemplateColumns: `auto repeat(${hours.length}, minmax(0, 1fr))` }}
                aria-hidden
            >
                <span />
                {hours.map(h => (
                    <span key={h} className={styles.hh}>
                        {h % 2 === 1 ? h : ""}
                    </span>
                ))}
                {rows.map(r => {
                    const max = Math.max(...r.values.values(), 1);
                    return [
                        <span key={r.label} className={styles.rl}>
                            {r.label}
                        </span>,
                        ...hours.map(h => {
                            const v = r.values.get(h) ?? 0;
                            const i = cell++;
                            return (
                                <i
                                    key={`${r.label}-${h}`}
                                    className={styles.hc}
                                    style={{ "--v": Math.round((v / max) * 100), animationDelay: `${i * 9}ms` } as CSSProperties}
                                    title={`${h}:00 · ${int(v)} ${r.unit}`}
                                />
                            );
                        })
                    ];
                })}
            </div>
            <table className="visually-hidden">
                <caption>Per ora del giorno, dalle {first} alle {last + 1}</caption>
                <thead>
                    <tr>
                        <th scope="col">Ora</th>
                        {rows.map(r => (
                            <th key={r.label} scope="col">
                                {r.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {hours.map(h => (
                        <tr key={h}>
                            <th scope="row">{`${h}–${h + 1}`}</th>
                            {rows.map(r => (
                                <td key={r.label}>{int(r.values.get(h) ?? 0)}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className={styles.cap}>Più scuro, più gente. Il più pieno: {fullest}.</p>
        </div>
    );
}

export function Brief({ data, featured }: { data: AndamentoData; featured: { text: string; to: string } }) {
    const visits = data.overview?.total_views ?? 0;
    const small = isBelowSample(visits);
    const topViewed = data.topViewed[0]?.product_name;
    const topOrdered = data.orders?.topByQuantity[0]?.product_name;
    const mobile = data.devices.find(d => d.device_type === "mobile");
    const missing = [...data.searchTerms].filter(t => t.avg_results === 0).sort((a, b) => b.search_count - a.search_count)[0];
    const items: { text: string; warn?: boolean }[] = [
        topViewed
            ? {
                  text:
                      topOrdered === topViewed
                          ? `«${topViewed}» è il più aperto e il più ordinato.`
                          : `«${topViewed}» è il più aperto${topOrdered ? `, «${topOrdered}» il più ordinato` : ""}.`
              }
            : null,
        mobile && !small ? { text: `${pct(mobile.percentage)} delle visite arriva dal telefono.` } : null,
        missing ? { text: `«${missing.search_term}» è cercato ${int(missing.search_count)} volte e non trova niente.`, warn: true } : null
    ].filter((x): x is { text: string; warn?: boolean } => x !== null);
    return (
        <div className={`${styles.card} ${styles.brief} ${styles.rise} ${styles.k6}`}>
            <h3>In breve</h3>
            {items.length > 0 ? (
                <ul>
                    {items.map(item => (
                        <li key={item.text} data-warn={item.warn ? "" : undefined}>
                            {item.text}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className={styles.cap}>Ancora niente da dire.</p>
            )}
            <p className={styles.ev}>
                <b>In evidenza:</b> {featured.text}{" "}
                <Link to={featured.to}>Apri ›</Link>
            </p>
        </div>
    );
}

// ── La pagina ────────────────────────────────────────────────────────

/** Il primo contenitore sopra `el` che scorre davvero. */
function scrollBox(el: HTMLElement): HTMLElement | null {
    for (let p = el.parentElement; p; p = p.parentElement) {
        const y = getComputedStyle(p).overflowY;
        if ((y === "auto" || y === "scroll") && p.scrollHeight > p.clientHeight) return p;
    }
    return null;
}

export interface AndamentoDProps {
    lead: string;
    loading: boolean;
    /** Periodo ed Esporta, già pronti. */
    commands: ReactNode;
    /** Avvisi sotto la frase (confronto non caricato). */
    notice?: ReactNode;
    rows: readonly AndamentoRow[];
    series: Partial<Record<RowKey, number[]>>;
    compare: readonly SedeCompared[] | null;
    selected: AndamentoRow | null;
    onSelect: (key: RowKey) => void;
    data: AndamentoData;
    chart: DailyChart | null;
    period: PeriodKey;
    paths: DetailProps["paths"];
    featured: { text: string; to: string };
}

export function AndamentoD(props: AndamentoDProps) {
    const { selected } = props;
    const andRef = useRef<HTMLDivElement>(null);
    // In tablet e telefono, se il grafico è più giù dello schermo, ci si porta
    // sopra (Visual Redesign 2): scorre solo il riquadro del contenuto.
    const onSelect = (key: RowKey) => {
        props.onSelect(key);
        const el = andRef.current;
        if (!el || !window.matchMedia("(max-width: 1023px)").matches) return;
        const box = scrollBox(el);
        if (!box) return;
        const r = el.getBoundingClientRect();
        if (r.top <= window.innerHeight * 0.72) return;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        box.scrollBy({ top: r.top - box.getBoundingClientRect().top - 12, behavior: reduce ? "auto" : "smooth" });
    };
    return (
        <div className={styles.page}>
            <div className={`${styles.cmd} ${styles.rise} ${styles.k1}`}>
                <p className={styles.answer} aria-live="polite" data-loading={props.loading ? "" : undefined}>
                    <Lead text={props.lead} />
                </p>
                {props.commands}
            </div>
            {props.notice}
            <p className={`${styles.vhint} ${styles.rise} ${styles.k3}`}>Tocca un numero: il grafico qui sotto mostra quello</p>
            <Voices rows={props.rows} series={props.series} compare={props.compare} selected={selected?.key ?? null} onSelect={onSelect} />
            <div ref={andRef} className={styles.and} data-wide={selected?.key === "ricerche" ? "" : undefined}>
                {selected && (
                    <Detail row={selected} data={props.data} chart={props.chart} compare={props.compare} period={props.period} paths={props.paths} />
                )}
                <div className={styles.sidecol}>
                    <Heat data={props.data} />
                    <Brief data={props.data} featured={props.featured} />
                </div>
            </div>
        </div>
    );
}
