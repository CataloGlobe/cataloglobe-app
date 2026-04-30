import PublicSheet from "../PublicSheet/PublicSheet";
import AllergenIcon from "@components/ui/AllergenIcon/AllergenIcon";
import Text from "@components/ui/Text/Text";
import type { Allergen } from "@services/supabase/allergens";
import styles from "./AllergensSheet.module.scss";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    allergens: Allergen[];
};

export default function AllergensSheet({ isOpen, onClose, allergens }: Props) {
    return (
        <PublicSheet
            isOpen={isOpen}
            onClose={onClose}
            ariaLabel="Allergeni"
            headerContent={
                <div className={styles.header}>
                    <Text variant="body" weight={700} className={styles.headerTitle} color="var(--pub-surface-text)">
                        Allergeni
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
                    {allergens.map(a => (
                        <li key={a.id} className={styles.item}>
                            <span className={styles.iconWrap} aria-hidden>
                                <AllergenIcon code={a.code} size={20} variant="bare" />
                            </span>
                            <Text variant="body-sm" className={styles.label} color="var(--pub-surface-text)">
                                {a.label_it}
                            </Text>
                        </li>
                    ))}
                </ul>
                <Text variant="caption-xs" className={styles.disclaimer} color="var(--pub-surface-text-muted)">
                    Per informazioni dettagliate sulla preparazione e sulla presenza di allergeni nei singoli piatti, chiedi al personale di sala.
                </Text>
            </div>
        </PublicSheet>
    );
}
