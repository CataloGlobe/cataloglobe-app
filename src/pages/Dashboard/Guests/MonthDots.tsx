import type { MonthMark } from "./guestActivity";
import styles from "./MonthDots.module.scss";

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/**
 * I 12 pallini degli ultimi 12 mesi (Clienti A, D154): pieno se è venuto,
 * arancio se ha solo saltato, vuoto se non c'è stato. Dal più vecchio a
 * questo mese.
 */
export function MonthDots({ months, today = new Date() }: { months?: readonly MonthMark[]; today?: Date }) {
    const marks = months ?? Array<MonthMark>(12).fill(0);
    const came = marks.filter(m => m === 1).length;
    const label = `Ultimi 12 mesi: venuto in ${came} ${came === 1 ? "mese" : "mesi"}`;
    return (
        <span className={styles.dots} role="img" aria-label={label}>
            {marks.map((m, i) => {
                const month = MONTHS[(today.getMonth() - 11 + i + 12) % 12];
                return (
                    <i
                        key={i}
                        className={styles.dot}
                        data-mark={m === 1 ? "came" : m === 2 ? "absent" : undefined}
                        title={month}
                    />
                );
            })}
        </span>
    );
}
