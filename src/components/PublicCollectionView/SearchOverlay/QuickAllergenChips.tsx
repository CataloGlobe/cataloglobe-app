import { useTranslation } from "react-i18next";
import { Check, SlidersHorizontal } from "lucide-react";
import AllergenIcon from "@components/ui/AllergenIcon/AllergenIcon";
import type { ResolvedAllergen } from "@/types/resolvedCollections";
import styles from "./SearchOverlay.module.scss";

type Props = {
    /** Allergeni più frequenti nel catalogo, già ordinati e troncati dal parent. */
    allergens: ResolvedAllergen[];
    selectedIds: number[];
    /** Applica SUBITO: i chip rapidi non passano dal draft della vista filtri. */
    onToggle: (id: number) => void;
    onOpenFilters: () => void;
    visibleCount: number;
    totalCount: number;
};

/**
 * Contenuto della vista ricerca a campo vuoto: chip rapidi degli allergeni più
 * frequenti, accesso alla vista filtri completa, contatore dei piatti visibili.
 */
export default function QuickAllergenChips({
    allergens,
    selectedIds,
    onToggle,
    onOpenFilters,
    visibleCount,
    totalCount,
}: Props) {
    const { t } = useTranslation("public");

    return (
        <div className={styles.quickFilters}>
            {allergens.length > 0 && (
                <ul className={styles.chipRow}>
                    {allergens.map(a => {
                        const selected = selectedIds.includes(a.id);
                        return (
                            <li key={a.id}>
                                <button
                                    type="button"
                                    className={`${styles.chip} ${selected ? styles.chipSelected : ""}`}
                                    onClick={() => onToggle(a.id)}
                                    aria-pressed={selected}
                                >
                                    {selected ? (
                                        <Check size={12} strokeWidth={3} aria-hidden />
                                    ) : (
                                        <span className={styles.chipIcon} aria-hidden>
                                            <AllergenIcon code={a.code} size={14} variant="bare" />
                                        </span>
                                    )}
                                    <span>{a.label}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            <div className={styles.quickFooter}>
                <button
                    type="button"
                    className={styles.allFiltersBtn}
                    onClick={onOpenFilters}
                >
                    <SlidersHorizontal size={14} strokeWidth={2} aria-hidden />
                    <span>{t("search.all_filters")}</span>
                </button>
                <span className={styles.visibleCount}>
                    {t("search.visible_count", { visible: visibleCount, total: totalCount })}
                </span>
            </div>
        </div>
    );
}
