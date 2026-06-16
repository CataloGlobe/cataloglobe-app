import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    title: string;
    description: string;
};

/**
 * Placeholder card per metriche prenotazioni non ancora raccoglibili
 * (no-show / turn-time / utilizzo tavoli): lo schema è pronto
 * (migration 20260615140000) ma servono le azioni di flusso. Badge "Presto".
 */
export default function ReservationsSoonCard({ title, description }: Props) {
    return (
        <article className={styles.chartCard} aria-label={title}>
            <header className={styles.chartCardHeader}>
                <Text variant="title-sm" align="left">
                    {title}
                </Text>
                <span className={styles.soonBadge}>Presto</span>
            </header>
            <div className={styles.chartCardBody}>
                <div className={styles.chartEmpty}>
                    <Text variant="body" colorVariant="muted">
                        {description}
                    </Text>
                </div>
            </div>
        </article>
    );
}
