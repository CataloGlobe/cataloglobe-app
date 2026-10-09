import { Link } from "react-router-dom";
import { CalendarCheck, ChevronRight, Globe, Receipt, Search, Sparkles, Star, type LucideIcon } from "lucide-react";
import { Sparkline } from "./AndamentoCharts";
import { sedeColor } from "../utils/andamentoFormat";
import { compareValue, formatDelta, type AndamentoRow, type AnswerPart, type RowKey, type SedeCompared } from "../utils/andamentoRows";
import styles from "../Analytics.module.scss";

const ROW_ICONS: Record<RowKey, LucideIcon> = {
    pagina: Globe,
    tavolo: Receipt,
    prenotazioni: CalendarCheck,
    recensioni: Star,
    ricerche: Search
};

export function Delta({ value }: { value: number | null }) {
    if (value === null) return null;
    const r = Math.round(value);
    return (
        <span className={styles.delta} data-trend={r > 0 ? "up" : r < 0 ? "down" : "same"}>
            {formatDelta(value)}
        </span>
    );
}

export function Answer({ parts }: { parts: readonly AnswerPart[] }) {
    return (
        <>
            {parts.map((p, i) => (p.strong ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>))}
        </>
    );
}

/** Le barre delle sedi a confronto per una riga: nome, barra, numero, confronto. */
export function CompareBars({ rowKey, sedi }: { rowKey: RowKey; sedi: readonly SedeCompared[] }) {
    const values = sedi.map(s => compareValue(rowKey, s.numbers));
    const max = Math.max(...values.map(v => v?.value ?? 0), 0);
    return (
        <span className={styles.compare}>
            {sedi.map((s, i) => {
                const v = values[i];
                if (!v) return null;
                return (
                    <span key={s.id} className={styles.compareRow}>
                        <span className={styles.compareName}>{s.name}</span>
                        <span className={styles.track} aria-hidden>
                            <i style={{ width: `${max > 0 ? (v.value / max) * 100 : 0}%`, background: sedeColor(i) }} />
                        </span>
                        <span className={styles.compareValue}>{v.label}</span>
                        <span className={styles.compareDelta}>
                            <Delta value={v.delta} />
                        </span>
                    </span>
                );
            })}
        </span>
    );
}

export interface AndamentoRowsProps {
    rows: readonly AndamentoRow[];
    /** La linea piccola di ogni riga. */
    series: Partial<Record<RowKey, number[]>>;
    /** Le sedi a confronto, la prima è quella che si guarda; null senza confronto. */
    compare: readonly SedeCompared[] | null;
    selected: RowKey | null;
    onOpen: (key: RowKey) => void;
    featured: { text: string; to: string };
}

/**
 * Andamento B (D154): una riga per cosa, nello stesso ordine; il clic apre
 * il dettaglio accanto (D131). Le righe senza dati scendono in fondo, in
 * grigio, col perché e l'uscita.
 */
export function AndamentoRows({ rows, series, compare, selected, onOpen, featured }: AndamentoRowsProps) {
    return (
        <>
            <ul className={styles.rows} aria-label="Andamento">
                {rows.map(row => {
                    const Icon = ROW_ICONS[row.key];
                    if (row.empty) {
                        return (
                            <li key={row.key} className={styles.rowEmpty}>
                                <span className={styles.rowTitle}>
                                    <Icon size={17} aria-hidden />
                                    {row.title}
                                </span>
                                <span>{row.empty.text}</span>
                                {row.empty.action && (
                                    <Link className={styles.rowLink} to={row.empty.action.to}>
                                        {row.empty.action.label} ›
                                    </Link>
                                )}
                            </li>
                        );
                    }
                    const comparing = compare !== null && row.key !== "ricerche";
                    return (
                        <li key={row.key}>
                            <button
                                type="button"
                                className={styles.row}
                                aria-current={selected === row.key ? "true" : undefined}
                                onClick={() => onOpen(row.key)}
                            >
                                <span className={styles.rowTitle}>
                                    <Icon size={17} aria-hidden />
                                    {row.title}
                                </span>
                                <span className={styles.rowAnswer}>
                                    <Answer parts={row.answer} /> <Delta value={row.delta} />
                                </span>
                                {comparing ? (
                                    <CompareBars rowKey={row.key} sedi={compare} />
                                ) : (
                                    <>
                                        <span className={styles.rowSpark}>
                                            <Sparkline values={series[row.key] ?? []} />
                                        </span>
                                        <span className={styles.rowExtras}>
                                            {row.extras.map(x => (
                                                <span key={x}>{x}</span>
                                            ))}
                                        </span>
                                    </>
                                )}
                                <ChevronRight className={styles.rowChevron} size={16} aria-hidden />
                            </button>
                        </li>
                    );
                })}
            </ul>
            <div className={styles.featured}>
                <span className={styles.rowTitle}>
                    <Sparkles size={17} aria-hidden />
                    In evidenza
                </span>
                <span>{featured.text}</span>
                <Link className={styles.rowLink} to={featured.to}>
                    Apri ›
                </Link>
            </div>
        </>
    );
}
