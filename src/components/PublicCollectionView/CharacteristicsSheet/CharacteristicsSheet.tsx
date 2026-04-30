import PublicSheet from "../PublicSheet/PublicSheet";
import CharacteristicIcon from "@/components/ui/CharacteristicIcon/CharacteristicIcon";
import Text from "@/components/ui/Text/Text";
import type {
    ResolvedCharacteristic
} from "@/types/resolvedCollections";
import type { ProductCharacteristicCategory } from "@/types/productCharacteristic";
import styles from "./CharacteristicsSheet.module.scss";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    /** Pre-ordered by `sort_order`. Empty → caller hides the trigger button. */
    characteristics: ResolvedCharacteristic[];
};

/**
 * Threshold above which each row gets a category caption underneath. Below
 * this number of distinct categories the legend stays flat to keep the
 * sheet compact for small catalogs.
 */
const CATEGORY_CAPTION_THRESHOLD = 3;

const CATEGORY_LABELS: Record<ProductCharacteristicCategory, string> = {
    diet: "Dieta",
    spicy: "Piccantezza",
    origin: "Origine e qualità",
    preparation: "Preparazione",
    warning: "Avvertenze",
    status: "Stato"
};

export default function CharacteristicsSheet({
    isOpen,
    onClose,
    characteristics
}: Props) {
    const distinctCategories = new Set(characteristics.map(c => c.category)).size;
    const showCategoryCaption = distinctCategories >= CATEGORY_CAPTION_THRESHOLD;

    return (
        <PublicSheet
            isOpen={isOpen}
            onClose={onClose}
            ariaLabel="Caratteristiche"
            headerContent={
                <div className={styles.header}>
                    <Text
                        variant="body"
                        weight={700}
                        className={styles.headerTitle}
                        color="var(--pub-surface-text)"
                    >
                        Caratteristiche
                    </Text>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={onClose}
                        aria-label="Chiudi"
                    >
                        Chiudi
                    </button>
                </div>
            }
        >
            <div className={styles.body}>
                <ul className={styles.list}>
                    {characteristics.map(c => (
                        <li key={c.id} className={styles.item}>
                            <span className={styles.iconWrap} aria-hidden>
                                <CharacteristicIcon icon={c.icon} size={20} variant="bare" />
                            </span>
                            <div className={styles.itemBody}>
                                <Text
                                    variant="body-sm"
                                    className={styles.label}
                                    color="var(--pub-surface-text)"
                                >
                                    {c.label_it}
                                </Text>
                                {showCategoryCaption && (
                                    <Text
                                        variant="caption-xs"
                                        className={styles.caption}
                                        color="var(--pub-surface-text-muted)"
                                    >
                                        {CATEGORY_LABELS[c.category]}
                                    </Text>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
                <Text
                    variant="caption-xs"
                    className={styles.disclaimer}
                    color="var(--pub-surface-text-muted)"
                >
                    Le caratteristiche indicate sono dichiarate dal ristoratore. Per
                    certificazioni specifiche (Halal, Kosher, Bio) o esigenze
                    particolari, chiedi al personale di sala.
                </Text>
            </div>
        </PublicSheet>
    );
}
