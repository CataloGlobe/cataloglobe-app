import { useTranslation } from "react-i18next";
import { AlertCircle, Check } from "lucide-react";
import AllergenIcon from "@components/ui/AllergenIcon/AllergenIcon";
import Text from "@components/ui/Text/Text";
import type { ResolvedAllergen } from "@/types/resolvedCollections";
import styles from "./AllergenFilterBody.module.scss";

/**
 * Corpo del filtro allergeni: intro + lista chip selezionabili + disclaimer.
 *
 * Componente puro e controllato: nessuno stato interno, nessun effect, nessuna
 * nozione del contenitore che lo ospita (sheet, pannello, altro). Il draft e
 * le azioni Azzera/Applica vivono nel consumer.
 *
 * Il layout esterno (scroll, padding, gap) arriva via `className`: è il
 * contenitore a decidere come il corpo si inserisce nella propria superficie.
 */
type Props = {
    /** Allergeni selezionabili, già ordinati e localizzati dal consumer. */
    allergens: ResolvedAllergen[];
    /** Id attualmente selezionati (il draft del consumer). */
    selectedIds: number[];
    /** Notifica il toggle di un allergene. Il consumer aggiorna il proprio stato. */
    onToggle: (id: number) => void;
    /** Classe del root: layout esterno, deciso dal contenitore. */
    className?: string;
};

export default function AllergenFilterBody({ allergens, selectedIds, onToggle, className }: Props) {
    const { t } = useTranslation("public");

    return (
        <div className={className}>
            <Text variant="body-sm" className={styles.filterIntro} color="var(--pub-surface-text-muted)">
                {t("allergens.filter_intro")}
            </Text>

            {allergens.length === 0 ? (
                <div className={styles.filterEmpty}>
                    <Text variant="body-sm" color="var(--pub-surface-text-muted)">
                        {t("allergens.filter_empty")}
                    </Text>
                </div>
            ) : (
                <ul className={styles.list}>
                    {allergens.map(a => {
                        const selected = selectedIds.includes(a.id);
                        return (
                            <li key={a.id}>
                                <button
                                    type="button"
                                    onClick={() => onToggle(a.id)}
                                    className={`${styles.filterRow} ${selected ? styles.filterRowSelected : ""}`}
                                    aria-pressed={selected}
                                >
                                    <span className={styles.iconWrap} aria-hidden>
                                        <AllergenIcon code={a.code} size={20} variant="bare" />
                                    </span>
                                    <span className={styles.label}>
                                        {a.label}
                                    </span>
                                    <span className={styles.checkbox} aria-hidden>
                                        {selected && <Check size={12} strokeWidth={3} />}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {allergens.length > 0 && (
                <div className={styles.filterDisclaimer}>
                    <AlertCircle size={14} aria-hidden />
                    <Text variant="caption-xs" color="var(--pub-surface-text-muted)">
                        {t("allergens.filter_disclaimer")}
                    </Text>
                </div>
            )}
        </div>
    );
}
