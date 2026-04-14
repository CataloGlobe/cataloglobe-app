import type { V2FeaturedContent } from "@/types/resolvedCollections";
import Text from "@/components/ui/Text/Text";
import styles from "./EventsView.module.scss";

type EventsViewProps = {
    featuredContents: V2FeaturedContent[];
};

export default function EventsView({ featuredContents }: EventsViewProps) {
    if (featuredContents.length === 0) {
        return (
            <div className={styles.emptyState}>
                <Text variant="body" colorVariant="muted">
                    Nessun evento o promozione disponibile al momento.
                </Text>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {featuredContents.map(fc => (
                <div key={fc.id} className={styles.card}>
                    {fc.media_id && (
                        <img
                            src={fc.media_id}
                            alt={fc.title}
                            className={styles.cardImage}
                            loading="lazy"
                        />
                    )}
                    <div className={styles.cardContent}>
                        <Text variant="title-sm" weight={700} className={styles.cardTitle}>
                            {fc.title}
                        </Text>
                        {fc.subtitle && (
                            <Text variant="body-sm" colorVariant="muted">
                                {fc.subtitle}
                            </Text>
                        )}
                        {fc.description && (
                            <Text variant="body" className={styles.cardDescription}>
                                {fc.description}
                            </Text>
                        )}
                        {fc.cta_text && fc.cta_url && (
                            <a
                                href={fc.cta_url}
                                className={styles.cardCta}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {fc.cta_text}
                            </a>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
