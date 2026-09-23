import type { ChartBar } from "@pages/CampaignLanding/content/landing";
import styles from "./BarChart.module.scss";

type BarChartProps = {
    bars: ChartBar[];
    /** Descrizione del grafico per chi usa un lettore di schermo. */
    label: string;
};

/** Grafico a barre per giorno della settimana, statico (barre già cresciute). */
export default function BarChart({ bars, label }: BarChartProps) {
    return (
        <ul className={styles.chart} aria-label={label}>
            {bars.map((bar, i) => {
                const value = Math.max(0, Math.min(100, Math.round(bar.value)));
                const barClass = [
                    styles.bar,
                    styles[`h${value}`],
                    bar.tone === "empty" ? styles.empty : null,
                    bar.tone === "highlight" ? styles.highlight : null
                ]
                    .filter(Boolean)
                    .join(" ");
                const dayClass = [
                    styles.day,
                    bar.tone !== "normal" ? styles.dayStrong : null,
                    bar.tone === "highlight" ? styles.dayInk : null
                ]
                    .filter(Boolean)
                    .join(" ");

                return (
                    <li key={i} className={styles.col}>
                        <span className={styles.track}>
                            <span className={barClass} />
                        </span>
                        <span className={dayClass}>{bar.day}</span>
                    </li>
                );
            })}
        </ul>
    );
}
