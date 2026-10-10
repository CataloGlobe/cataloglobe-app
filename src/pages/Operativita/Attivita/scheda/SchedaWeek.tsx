import { DAY_SHORT, hh, spansText, type SchedaFacts } from "./schedaModel";
import styles from "./Scheda.module.scss";

/** Dalle 6 alle 2 di notte: un nastro per giorno, la linea rossa è adesso. */
const H0 = 6 * 60;
const H1 = 26 * 60;
const pct = (m: number) => `${(((Math.min(Math.max(m, H0), H1) - H0) / (H1 - H0)) * 100).toFixed(2)}%`;

export function SchedaWeek({ facts }: { facts: SchedaFacts }) {
    const { weekSpans, now } = facts;
    return (
        <div className={styles.week} aria-label="La settimana">
            {weekSpans.map((spans, i) => {
                const today = i === now.weekday;
                return (
                    <div
                        key={DAY_SHORT[i]}
                        className={[styles.wkRow, today && styles.wkToday, !spans.length && styles.wkOff].filter(Boolean).join(" ")}
                        title={`${DAY_SHORT[i]}: ${spansText(spans)}`}
                    >
                        <span className={styles.wkD}>{DAY_SHORT[i]}</span>
                        <div className={styles.wkTrack}>
                            {spans.map(s => (
                                <span
                                    key={`${s.a}-${s.b}`}
                                    className={styles.wkSeg}
                                    style={{ left: pct(s.a), width: `calc(${pct(s.b)} - ${pct(s.a)})` }}
                                />
                            ))}
                            {today && (
                                <span
                                    className={styles.wkNow}
                                    style={{ left: pct(now.minutes < H0 ? now.minutes + 1440 : now.minutes) }}
                                    title={`Adesso, ${hh(now.minutes)}`}
                                />
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
