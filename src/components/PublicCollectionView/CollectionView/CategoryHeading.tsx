import Text from "@/components/ui/Text/Text";
import type { CategoryTitle, CompactLayoutStyle, ProductStyle } from "@/types/collectionStyle";
import { categoryIcon } from "./categoryIcon";
import styles from "./CollectionView.module.scss";

type Props = {
    name: string;
    /** Posizione della categoria (0 = prima): il numero del compatto moderno. */
    index: number;
    productStyle?: ProductStyle;
    compactLayoutStyle?: CompactLayoutStyle;
    categoryTitle?: CategoryTitle;
};

/**
 * Titolo della categoria come nell'editor stili: con i piatti a riquadro trattino sotto,
 * icona o solo testo; nel compatto moderno il numero e una linea sotto; nell'editoriale e
 * nel centrato il titolo centrato fra due linee (lì l'icona non c'è).
 */
export default function CategoryHeading({ name, index, productStyle, compactLayoutStyle = "modern", categoryTitle = "dash" }: Props) {
    const title = (
        <Text as="h2" variant="title-sm" weight={700} color="var(--pub-bg-text)">
            {name}
        </Text>
    );

    if (productStyle === "compact") {
        if (compactLayoutStyle === "modern") {
            return (
                <div className={`${styles.categoryHeading} ${styles.categoryHeadingNumbered}`}>
                    <span className={styles.categoryHeadingNumber} aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                    </span>
                    {title}
                </div>
            );
        }
        return <div className={`${styles.categoryHeading} ${styles.categoryHeadingCentered}`}>{title}</div>;
    }

    if (categoryTitle === "icon") {
        const Icon = categoryIcon(name);
        return (
            <div className={`${styles.categoryHeading} ${styles.categoryHeadingIcon}`}>
                <span className={styles.categoryHeadingIconChip} aria-hidden="true">
                    <Icon size={18} strokeWidth={1.7} />
                </span>
                {title}
            </div>
        );
    }

    if (categoryTitle === "dash") {
        return (
            <div className={`${styles.categoryHeading} ${styles.categoryHeadingDash}`}>
                {title}
                <span className={styles.categoryHeadingDashLine} aria-hidden="true" />
            </div>
        );
    }

    return <div className={styles.categoryHeading}>{title}</div>;
}
