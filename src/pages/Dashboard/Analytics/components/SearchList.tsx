import type { SearchTermData } from "@/services/supabase/analytics";
import styles from "../Analytics.module.scss";

/**
 * Cosa cercano nel menù (D154): una riga per parola con la barra; quelle
 * che non trovano niente in arancio, perché lì manca qualcosa nel menù.
 */
export function SearchList({ terms }: { terms: readonly SearchTermData[] }) {
    const sorted = [...terms].sort((a, b) => b.search_count - a.search_count).slice(0, 8);
    const max = Math.max(...sorted.map(t => t.search_count), 1);
    const notFound = sorted.filter(t => t.avg_results === 0);
    return (
        <div className={styles.searchList}>
            <ul aria-label="Cosa cercano">
                {sorted.map(t => (
                    <li key={t.search_term} className={styles.searchRow} data-missing={t.avg_results === 0 ? "" : undefined}>
                        <span>
                            {t.search_term}
                            {t.avg_results === 0 && <span className={styles.missingTag}>non trovato</span>}
                        </span>
                        <span className={styles.track} aria-hidden>
                            <i style={{ width: `${(t.search_count / max) * 100}%` }} />
                        </span>
                        <span className={styles.searchCount}>{t.search_count}</span>
                    </li>
                ))}
            </ul>
            {notFound.length > 0 && (
                <p className={styles.note}>
                    {notFound.map(t => `«${t.search_term}»`).join(", ")} {notFound.length === 1 ? "non trova" : "non trovano"} niente nel
                    menù: forse manca un piatto, o una parola nella descrizione.
                </p>
            )}
        </div>
    );
}
