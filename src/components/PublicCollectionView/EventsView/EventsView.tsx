import { useTranslation } from "react-i18next";
import { Pin } from "lucide-react";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import FeaturedCard from "@/components/PublicCollectionView/FeaturedCard/FeaturedCard";
import { FeaturedContentDetail } from "@/components/PublicCollectionView/FeaturedBlock/FeaturedContentDetail";
import Text from "@/components/ui/Text/Text";
import styles from "./EventsView.module.scss";

type EventsViewProps = {
    featuredContents: V2FeaturedContent[];
    layout?: "card" | "highlight" | "compact";
    /** Mostra il subtitle nella card overview. Default true (comportamento storico). */
    showSubtitle?: boolean;
    /** Mostra il titolo nella card overview. Default true (comportamento storico). */
    showTitle?: boolean;
    /** Mostra il pulsante CTA nella card overview. Default true (comportamento storico). */
    showCta?: boolean;
    /** Contenuto aperto nel dettaglio (null = elenco). Controllato dal parent:
     *  la CTA del dettaglio sta nel footer della PublicSheet, che è del parent. */
    selectedFeatured: V2FeaturedContent | null;
    onSelectFeatured: (block: V2FeaturedContent | null) => void;
};

export default function EventsView({ featuredContents, layout = "card", showSubtitle = true, showTitle = true, showCta = true, selectedFeatured, onSelectFeatured }: EventsViewProps) {
    const { t } = useTranslation("public");
    // Dettaglio in-place: niente seconda PublicSheet impilata sopra "Eventi &
    // Promo" (era il bug — doppio backdrop/handle). Stesso pattern di
    // ReviewsView "← Cambia voto": swap di contenuto dentro la stessa sheet.

    if (selectedFeatured) {
        return (
            <div className={styles.root}>
                <div className={styles.detailView}>
                    <button
                        type="button"
                        className={styles.backLink}
                        onClick={() => onSelectFeatured(null)}
                    >
                        {t("events.back")}
                    </button>
                    <div className={styles.detailContent}>
                        <FeaturedContentDetail block={selectedFeatured} />
                    </div>
                </div>
            </div>
        );
    }

    if (featuredContents.length === 0) {
        return (
            <div className={styles.emptyState}>
                <Pin size={48} strokeWidth={1.5} className={styles.emptyIcon} />
                <Text variant="body" color="var(--pub-bg-text-muted)">
                    {t("events.empty")}
                </Text>
            </div>
        );
    }

    return (
        <div className={styles.root}>
            <div
                className={styles.grid}
                role="list"
                aria-label={t("events.list_aria")}
            >
                {featuredContents.map(fc => (
                    <FeaturedCard
                        key={fc.id}
                        block={fc}
                        onClick={() => onSelectFeatured(fc)}
                        className={styles.cardFull}
                        variant={layout}
                        showSubtitle={showSubtitle}
                        showTitle={showTitle}
                        showCta={showCta}
                    />
                ))}
            </div>
        </div>
    );
}
