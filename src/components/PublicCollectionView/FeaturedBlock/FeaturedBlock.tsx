import React from "react";
import styles from "./FeaturedBlock.module.scss";
import type { V2FeaturedContent } from "@/services/supabase/v2/resolveActivityCatalogsV2";
import Text from "@/components/ui/Text/Text";

type Props = {
    blocks: V2FeaturedContent[];
};

export default function FeaturedBlock({ blocks }: Props) {
    if (!blocks || blocks.length === 0) return null;

    return (
        <div className={styles.container}>
            {blocks.map(block => (
                <div key={block.id} className={styles.card}>
                    <Text variant="title-md" as="h3" className={styles.title}>
                        {block.title}
                    </Text>
                    {block.type === "informativo" ? (
                        <div className={styles.informativeContent}>
                            <Text variant="body" colorVariant="muted">
                                Contenuto informativo (Dettagli aggiuntivi arriveranno dalla query)
                            </Text>
                        </div>
                    ) : (
                        <div className={styles.compositeContent}>
                            <Text variant="body-sm" colorVariant="muted">
                                Prodotti in evidenza (Dettagli aggiuntivi arriveranno dalla query)
                            </Text>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
