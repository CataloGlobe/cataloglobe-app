import Text from "@/components/ui/Text/Text";
import styles from "./CollectionHero.module.scss";

export type CollectionHeroProps = {
    title: string;
    imageUrl?: string | null;
    subtitle?: string;
    variant?: "preview" | "public";
};

export default function CollectionHero({
    title,
    imageUrl,
    subtitle,
    variant = "public"
}: CollectionHeroProps) {
    return (
        <header
            className={styles.hero}
            data-variant={variant}
            aria-label="Intestazione del catalogo"
        >
            <div className={styles.inner}>
                <div className={styles.imageWrapper}>
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt=""
                            role="presentation"
                            className={styles.image}
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
                        <span className={styles.subtitle}>
                            <Text variant="body">{subtitle}</Text>
                        </span>
                    )}
                </div>
            </div>
        </header>
    );
}
