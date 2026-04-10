import { ImageIcon } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import styles from "./CollectionHero.module.scss";

export type CollectionHeroProps = {
    title: string;
    imageUrl?: string | null;
    subtitle?: string;
    variant?: "preview" | "public";
    showImage?: boolean;
    showTitle?: boolean;
    showSubtitle?: boolean;
};

export default function CollectionHero({
    title,
    imageUrl,
    subtitle,
    variant = "public",
    showImage = true,
    showTitle = true,
    showSubtitle = true
}: CollectionHeroProps) {
    const hasText = showTitle || (showSubtitle && !!subtitle);

    return (
        <header
            className={styles.hero}
            data-variant={variant}
            aria-label="Intestazione del catalogo"
        >
            <div className={styles.inner}>
                {showImage && (
                    <div className={styles.imageWrapper}>
                        {imageUrl ? (
                            <img
                                src={imageUrl}
                                alt=""
                                role="presentation"
                                className={styles.image}
                            />
                        ) : variant === "preview" ? (
                            <div className={styles.placeholderPreview} aria-hidden>
                                <ImageIcon size={24} strokeWidth={1.5} className={styles.placeholderIcon} />
                            </div>
                        ) : (
                            <div className={styles.placeholder} aria-hidden />
                        )}
                    </div>
                )}

                {hasText && (
                    <div className={styles.textWrapper}>
                        {showTitle && (
                            <Text as="h1" variant="title-lg" weight={700}>
                                {title}
                            </Text>
                        )}

                        {showSubtitle && subtitle && (
                            <span className={styles.subtitle}>
                                <Text variant="body">{subtitle}</Text>
                            </span>
                        )}
                    </div>
                )}
            </div>
        </header>
    );
}
