import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays } from "lucide-react";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import FeaturedCard from "@/components/PublicCollectionView/FeaturedCard/FeaturedCard";
import { FeaturedPreviewModal } from "@/components/PublicCollectionView/FeaturedBlock/FeaturedPreviewModal";
import Text from "@/components/ui/Text/Text";
import styles from "./EventsView.module.scss";

type EventsViewProps = {
    featuredContents: V2FeaturedContent[];
    layout?: "card" | "highlight";
};

export default function EventsView({ featuredContents, layout = "card" }: EventsViewProps) {
    const { t } = useTranslation("public");
    const [previewBlock, setPreviewBlock] = useState<V2FeaturedContent | null>(null);

    if (featuredContents.length === 0) {
        return (
            <div className={styles.emptyState}>
                <CalendarDays size={48} strokeWidth={1.5} className={styles.emptyIcon} />
                <Text variant="body" color="var(--pub-bg-text-muted)">
                    {t("events.empty")}
                </Text>
            </div>
        );
    }

    return (
        <>
        <div className={styles.container} role="list" aria-label={t("events.list_aria")}>
            {featuredContents.map(fc => (
                <FeaturedCard
                    key={fc.id}
                    block={fc}
                    onClick={() => setPreviewBlock(fc)}
                    className={styles.cardFull}
                    variant={layout}
                />
            ))}
        </div>
        <FeaturedPreviewModal
            block={previewBlock}
            isOpen={!!previewBlock}
            onClose={() => setPreviewBlock(null)}
        />
        </>
    );
}
