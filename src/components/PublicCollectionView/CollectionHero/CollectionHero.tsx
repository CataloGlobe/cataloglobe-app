import Text from "@/components/ui/Text/Text";
import styles from "./CollectionHero.module.scss";

export type CollectionHeroProps = {
    title: string;
    imageUrl?: string | null;
    subtitle?: string;
    variant?: "preview" | "public";
    style?: {
        backgroundColor?: string;
        imageRadius?: number;
    };
};

export default function CollectionHero({
    title,
    imageUrl,
    subtitle,
    variant = "public",
    style
}: CollectionHeroProps) {
    return (
        <header
            className={styles.hero}
            data-variant={variant}
            aria-label="Intestazione del catalogo"
            style={{ backgroundColor: style?.backgroundColor }}
        >
            <div className={styles.imageWrapper}>
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt=""
                        role="presentation"
                        className={styles.image}
                        style={{ borderRadius: style?.imageRadius }}
                    />
                ) : (
                    <div className={styles.placeholder} aria-hidden />
                )}
            </div>

            <div className={styles.textWrapper}>
                <Text as="h1" variant="title-lg" weight={700}>
                    {title}
                </Text>

                {subtitle && (
                    <Text variant="body" colorVariant="muted">
                        {subtitle}
                    </Text>
                )}
            </div>
        </header>
    );
}
