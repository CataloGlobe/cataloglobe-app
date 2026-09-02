import { useTranslation } from "react-i18next";
import PublicSheet from "../PublicSheet/PublicSheet";
import AllergenIcon from "@components/ui/AllergenIcon/AllergenIcon";
import Text from "@components/ui/Text/Text";
import type { Allergen } from "@services/supabase/allergens";
import styles from "./AllergensSheet.module.scss";

// TODO post-launch: AllergensSheet mostra il catalogo globale
// (V2SystemAllergen, label_it hardcoded). Per traduzione multilingua, estendere
// il service mapper allergens.ts a fetchare anche translations table.

/**
 * Scheda informativa degli allergeni: elenco consultabile, aperto dal
 * PublicFooter.
 *
 * NON è un filtro. Filtrare per allergeni si fa dal pannello unificato
 * (SearchOverlay, vista filtri), unica superficie con quella funzione: qui
 * esisteva una seconda modalità che faceva la stessa cosa con un altro chrome,
 * rimossa quando la voce dentro «…» è passata al pannello.
 */
type Props = {
    isOpen: boolean;
    onClose: () => void;
    allergens: Allergen[];
};

export default function AllergensSheet({ isOpen, onClose, allergens }: Props) {
    const { t } = useTranslation("public");

    return (
        <PublicSheet
            isOpen={isOpen}
            onClose={onClose}
            ariaLabel={t("allergens.title")}
            headerContent={
                <div className={styles.header}>
                    <Text variant="body" weight={700} className={styles.headerTitle} color="var(--pub-surface-text)">
                        {t("allergens.title")}
                    </Text>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={onClose}
                        aria-label={t("allergens.close_aria")}
                    >
                        {t("allergens.close_label")}
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
                    {t("allergens.disclaimer")}
                </Text>
            </div>
        </PublicSheet>
    );
}
