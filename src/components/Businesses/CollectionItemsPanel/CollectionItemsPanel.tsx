import Text from "@/components/ui/Text/Text";

import styles from "./CollectionItemsPanel.module.scss";
import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge/Badge";

type AvailableCollection = {
    id: string;
    name: string;
    slot: "primary" | "overlay" | "mixed";
    isActiveNow: boolean;
};

interface SectionItemsPanelProps {
    collections: AvailableCollection[];
    selectedCollectionId: string | null;
    onSelectCollection: (collectionId: string) => void;
}

export function CollectionItemsPanel({
    collections,
    selectedCollectionId,
    onSelectCollection
}: SectionItemsPanelProps) {
    const primaryCollections = useMemo(
        () => collections.filter(c => c.slot === "primary" || c.slot === "mixed"),
        [collections]
    );

    const overlayCollections = useMemo(
        () => collections.filter(c => c.slot === "overlay"),
        [collections]
    );

    const renderCollection = (c: AvailableCollection) => {
        const isSelected = c.id === selectedCollectionId;

        return (
            <li key={c.id} className={styles.row}>
                <button
                    type="button"
                    className={[styles.select, isSelected && styles.active]
                        .filter(Boolean)
                        .join(" ")}
                    onClick={() => onSelectCollection(c.id)}
                    aria-current={isSelected ? "true" : undefined}
                >
                    <Text>{c.name}</Text>

                    {c.isActiveNow && <Badge>In uso</Badge>}
                </button>
            </li>
        );
    };

    return (
        <main className={styles.items} aria-label="Contenuti categoria">
            {primaryCollections.length > 0 && (
                <section className={styles.itemsSection}>
                    <Text variant="body-lg" weight={600}>
                        Contenuti principali
                    </Text>

                    <ul className={styles.collectionList} role="list">
                        {primaryCollections.map(renderCollection)}
                    </ul>
                </section>
            )}

            {overlayCollections.length > 0 && (
                <section className={styles.itemsSection}>
                    <Text variant="body-lg" weight={600}>
                        Contenuti in evidenza
                    </Text>

                    <ul className={styles.collectionList} role="list">
                        {overlayCollections.map(renderCollection)}
                    </ul>
                </section>
            )}
        </main>
    );
}
