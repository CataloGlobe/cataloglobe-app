import { formatShortDay, sedeColor } from "../utils/andamentoFormat";
import styles from "./AndamentoCharts.module.scss";

/**
 * I due grafici di Andamento (D154), in SVG semplice: la linea piccola di
 * ogni riga e il grafico giorno per giorno. Una sede sola: barre, e il
 * periodo prima tratteggiato. Più sedi: una linea per sede, col suo colore.
 */

export function Sparkline({ values, width = 150, height = 30 }: { values: readonly number[]; width?: number; height?: number }) {
    if (values.length < 2) return null;
    const max = Math.max(...values, 1);
    const step = width / (values.length - 1);
    const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`).join(" ");
    return (
        <svg className={styles.spark} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
            <polyline points={points} />
        </svg>
    );
}

export interface DaySeries {
    values: readonly number[];
    /** Il colore (una variabile CSS); senza, quello del marchio. */
    color?: string;
}

export interface DayChartProps {
    /** I giorni dell'asse ("YYYY-MM-DD"), uno per valore. */
    dates: readonly string[];
    series: readonly DaySeries[];
    /** Il periodo prima, giorno per giorno (solo con una serie). */
    previous?: readonly number[] | null;
    label: string;
    width?: number;
    height?: number;
}

/** Il primo multiplo «tondo» sopra il massimo: 10, 20, 50, 100… */
function niceTop(max: number): number {
    if (max <= 0) return 1;
    const pow = 10 ** Math.floor(Math.log10(max));
    const step = [1, 2, 2.5, 5, 10].find(s => s * pow >= max) ?? 10;
    return step * pow;
}

export function DayChart({ dates, series, previous = null, label, width = 760, height = 170 }: DayChartProps) {
    const n = dates.length;
    if (n === 0 || series.length === 0) return null;
    const all = [...series.flatMap(s => s.values), ...(previous ?? [])];
    const top = niceTop(Math.max(...all, 0));
    const left = 34;
    const bottom = 20;
    const topPad = 8;
    const innerW = width - left - 6;
    const innerH = height - bottom - topPad;
    const slot = innerW / n;
    const y = (v: number) => topPad + innerH - (v / top) * innerH;
    const x = (i: number) => left + i * slot + slot / 2;
    const line = (values: readonly number[]) => values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const ticks = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : n === 2 ? [0, 1] : [0];

    return (
        <svg className={styles.chart} width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
            {[0, 0.5, 1].map(f => (
                <g key={f}>
                    <line className={styles.grid} x1={left} x2={width - 6} y1={y(top * f)} y2={y(top * f)} />
                    <text className={styles.axis} x={left - 6} y={y(top * f) + 4} textAnchor="end">
                        {Math.round(top * f).toLocaleString("it-IT")}
                    </text>
                </g>
            ))}
            {series.length === 1 ? (
                <>
                    {series[0].values.map((v, i) => (
                        <rect
                            key={i}
                            className={styles.bar}
                            x={(left + i * slot + slot * 0.18).toFixed(1)}
                            y={y(v).toFixed(1)}
                            width={(slot * 0.64).toFixed(1)}
                            height={(innerH - (y(v) - topPad)).toFixed(1)}
                            rx={2}
                            style={series[0].color ? { fill: series[0].color } : undefined}
                        />
                    ))}
                    {previous && previous.length > 0 && <polyline className={styles.previous} points={line(previous.slice(0, n))} />}
                </>
            ) : (
                series.map((s, i) => <polyline key={i} className={styles.line} points={line(s.values)} style={{ stroke: s.color ?? sedeColor(i) }} />)
            )}
            {ticks.map(i => (
                <text
                    key={i}
                    className={styles.axis}
                    x={x(i).toFixed(1)}
                    y={height - 5}
                    textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"}
                >
                    {formatShortDay(dates[i])}
                </text>
            ))}
        </svg>
    );
}
