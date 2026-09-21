/* eslint-disable react-refresh/only-export-components -- galleria dev: componenti di sezione + elenco nello stesso file, niente fast refresh da preservare */
import { TrendChart, type TrendPoint } from "@/components/ui/TrendChart/TrendChart";
import { StatCard } from "@/components/ui/StatCard/StatCard";
import { State, type GallerySection } from "../gallery";
import styles from "../DevUiPage.module.scss";

/* ------------------------------------------------------------------ */
/* TrendChart                                                          */
/* ------------------------------------------------------------------ */

function series(days: number, base: number, amp: number, seed = 1): TrendPoint[] {
    const out: TrendPoint[] = [];
    const start = new Date("2026-09-21T00:00:00");
    start.setDate(start.getDate() - (days - 1));
    let x = seed;
    for (let i = 0; i < days; i++) {
        x = (x * 9301 + 49297) % 233280;
        const noise = (x / 233280 - 0.5) * amp;
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        out.push({ date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, value: Math.max(0, Math.round(base + i * (amp / days) + noise)) });
    }
    return out;
}

const VISITS = series(30, 30, 24);
const ORDERS = series(14, 2, 6, 7);

function TrendChartSection() {
    return (
        <>
            <State label="line: 30 giorni di visite, ultimo punto col valore, 3 etichette in X, tooltip al hover" column>
                <TrendChart data={VISITS} aria-label="Visite negli ultimi 30 giorni" />
            </State>
            <State label="bars: conteggi giornalieri piccoli (14 giorni di ordini)" column>
                <TrendChart data={ORDERS} variant="bars" aria-label="Ordini negli ultimi 14 giorni" />
            </State>
            <State label="sparkline 80×24 dentro una StatCard" column>
                <div className={styles.statRow}>
                    <StatCard label="Visite al menù" value="1.284" delta={{ value: 12.5, period: "vs 30 giorni prima" }}>
                        <TrendChart data={VISITS} variant="sparkline" />
                    </StatCard>
                    <StatCard label="Ordini" value="96" delta={{ value: -8, period: "vs 30 giorni prima" }}>
                        <TrendChart data={ORDERS} variant="sparkline" />
                    </StatCard>
                </div>
            </State>
            <State label="valori formattati (euro)" column>
                <TrendChart data={series(30, 200, 120, 3)} formatValue={v => `${v} €`} />
            </State>
            <State label="caricamento: Skeleton dell'area" column>
                <TrendChart data={[]} loading />
            </State>
            <State label="vuoto: EmptyState inline, mai gli assi vuoti" column>
                <TrendChart data={[]} emptyTitle="Ancora nessuna visita" emptyDescription="Le visite si contano da quando il menù è pubblicato." />
            </State>
        </>
    );
}

export const chartsSections: GallerySection[] = [
    { id: "trendchart", title: "TrendChart", sheet: "TrendChart", Component: TrendChartSection }
];
