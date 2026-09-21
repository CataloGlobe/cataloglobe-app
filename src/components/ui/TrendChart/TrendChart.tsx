import { useId, useMemo } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Text from "@/components/ui/Text/Text";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { useChartTokens } from "./useChartTokens";
import styles from "./TrendChart.module.scss";

/**
 * TrendChart — una serie nel tempo: 30 giorni di visite, di aperture, di
 * ordini (design system §5, scheda TrendChart).
 *
 * Linea 2px brand-primary · area brand-primary-soft · ultimo punto in
 * evidenza (cerchio 6 con bordo surface) col valore a fianco · griglia
 * orizzontale tenue (3 linee) · asse X con tre etichette (inizio, metà, oggi)
 * · tooltip con data e valore. Varianti: line · bars (conteggi giornalieri
 * piccoli) · sparkline (80×24, senza assi, dentro una StatCard).
 * Altezza 160. Una serie sola, tinta unica, colori dai token.
 *
 * Non per due serie (→ due grafici impilati), non per distribuzioni
 * (→ BarList), non per una cifra (→ StatCard).
 */
export interface TrendPoint {
    /** ISO `YYYY-MM-DD` o qualunque stringa; `formatDate` la rende. */
    date: string;
    value: number;
}

export interface TrendChartProps {
    data: TrendPoint[];
    variant?: "line" | "bars" | "sparkline";
    /** Default 160 (sparkline 24). */
    height?: number;
    /** «1.284», «48 €». Default it-IT. */
    formatValue?: (value: number) => string;
    /** Etichette dell'asse e del tooltip. Default «21 set». */
    formatDate?: (date: string) => string;
    /** Skeleton dell'area. */
    loading?: boolean;
    /** Vuoto: cosa manca e perché (mai gli assi vuoti). */
    emptyTitle?: string;
    emptyDescription?: string;
    className?: string;
    "aria-label"?: string;
}

const nf = new Intl.NumberFormat("it-IT");
const df = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });

function defaultFormatDate(date: string) {
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? date : df.format(d);
}

export function TrendChart({
    data,
    variant = "line",
    height,
    formatValue = v => nf.format(v),
    formatDate = defaultFormatDate,
    loading = false,
    emptyTitle = "Ancora nessun dato",
    emptyDescription,
    className,
    "aria-label": ariaLabel
}: TrendChartProps) {
    const tokens = useChartTokens();
    const gradientId = useId();
    const sparkline = variant === "sparkline";
    const h = height ?? (sparkline ? 24 : 160);

    const ticks = useMemo(() => {
        if (data.length === 0) return [];
        const mid = Math.floor((data.length - 1) / 2);
        return Array.from(new Set([data[0].date, data[mid].date, data[data.length - 1].date]));
    }, [data]);

    if (loading) {
        return (
            <div className={`${styles.root} ${sparkline ? styles.sparkline : ""} ${className ?? ""}`.trim()} style={{ height: h }} aria-busy="true">
                <Skeleton width="100%" height="100%" radius="var(--radius-inner)" />
            </div>
        );
    }

    if (data.length === 0) {
        if (sparkline) return <div className={`${styles.root} ${styles.sparkline}`} style={{ height: h }} aria-hidden="true" />;
        return <EmptyState variant="inline" title={emptyTitle} description={emptyDescription} />;
    }

    const last = data[data.length - 1];
    const lastLabel = formatValue(last.value);

    return (
        <div className={`${styles.root} ${sparkline ? styles.sparkline : ""} ${className ?? ""}`.trim()} style={{ height: h }} role="img" aria-label={ariaLabel ?? `Andamento, ultimo valore ${lastLabel}`}>
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: sparkline ? 80 : 320, height: h }}>
                <ComposedChart data={data} margin={sparkline ? { top: 2, right: 2, bottom: 2, left: 2 } : { top: 12, right: 8 + lastLabel.length * 8, bottom: 0, left: 0 }}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={tokens.brand} stopOpacity={0.18} />
                            <stop offset="100%" stopColor={tokens.brand} stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    {!sparkline && (
                        <CartesianGrid
                            vertical={false}
                            stroke={tokens.border}
                            horizontalCoordinatesGenerator={({ height: gh, offset }) => {
                                const top = offset?.top ?? 0;
                                const usable = gh - top - (offset?.bottom ?? 0);
                                return [0.25, 0.5, 0.75].map(f => top + usable * f);
                            }}
                        />
                    )}
                    <XAxis
                        dataKey="date"
                        hide={sparkline}
                        ticks={ticks}
                        tickFormatter={formatDate}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: tokens.textMuted, fontSize: 12 }}
                        interval="preserveStartEnd"
                        height={20}
                    />
                    <YAxis hide domain={[0, "auto"]} />
                    {!sparkline && (
                        <Tooltip
                            cursor={{ stroke: tokens.border }}
                            content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const p = payload[0].payload as TrendPoint;
                                return (
                                    <div className={styles.tooltip}>
                                        <span>{formatDate(p.date)}</span>
                                        <strong>{formatValue(p.value)}</strong>
                                    </div>
                                );
                            }}
                        />
                    )}
                    {variant === "bars" ? (
                        <Bar dataKey="value" fill={tokens.brand} radius={[2, 2, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                    ) : (
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke={tokens.brand}
                            strokeWidth={2}
                            fill={sparkline ? "none" : `url(#${gradientId})`}
                            isAnimationActive={false}
                            activeDot={sparkline ? false : { r: 4, stroke: tokens.surface, strokeWidth: 2, fill: tokens.brand }}
                            dot={
                                sparkline
                                    ? false
                                    : props => {
                                          const { cx, cy, index } = props as { cx: number; cy: number; index: number };
                                          if (index !== data.length - 1) return <g key={index} />;
                                          return (
                                              <g key={index}>
                                                  <circle cx={cx} cy={cy} r={3} fill={tokens.brand} stroke={tokens.surface} strokeWidth={2} />
                                                  <text x={cx + 8} y={cy + 4} className={styles.lastValue} fill={tokens.brand}>
                                                      {lastLabel}
                                                  </text>
                                              </g>
                                          );
                                      }
                            }
                        />
                    )}
                </ComposedChart>
            </ResponsiveContainer>
            {!sparkline && (
                <Text as="span" variant="caption" className={styles.srOnly}>
                    {ariaLabel}
                </Text>
            )}
        </div>
    );
}
