import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import AllergenIcon from "@components/ui/AllergenIcon/AllergenIcon";
import CharacteristicIcon from "@components/ui/CharacteristicIcon/CharacteristicIcon";
import type { SheetsSlotContext } from "../slots";
import searchStyles from "../search/Search.module.scss";
import { allergenEntries, characteristicEntries } from "./menuInfo";
import { pushVenueSheet } from "./venueSheetPages";
import styles from "./VenueSheets.module.scss";

type MenuInfo = SheetsSlotContext["menuInfo"];

/**
 * Allergeni dal fondo (spec §10): l'elenco di legge, ognuno con quanti piatti
 * del menu lo contengono. È un elenco da leggere: filtrare si fa nei Filtri.
 */
export function AllergensPage({ allergens, groups }: MenuInfo) {
    const { t, i18n } = useTranslation("public");
    const entries = useMemo(() => allergenEntries(allergens, groups, i18n.language), [allergens, groups, i18n.language]);
    return (
        <div className={styles.list}>
            <p className={styles.intro}>{t("page_end.allergens_intro")}</p>
            <ul className={styles.plainList}>
                {entries.map(entry => (
                    <li key={entry.id} className={styles.infoRow} data-absent={entry.count === 0 || undefined}>
                        <span className={styles.rowIcon} aria-hidden>
                            <AllergenIcon code={entry.code} size={20} variant="bare" />
                        </span>
                        <span className={styles.rowText}>
                            <span className={styles.rowLabel}>{entry.label}</span>
                            <span className={styles.rowSubtitle}>
                                {entry.count > 0 ? t("page_end.in_dishes", { count: entry.count }) : t("page_end.not_in_menu")}
                            </span>
                        </span>
                    </li>
                ))}
            </ul>
            <p className={styles.note}>{t("allergens.disclaimer")}</p>
        </div>
    );
}

/** In fondo agli Allergeni: verso i Filtri, solo se qualche piatto ne ha. */
export function AllergensFooter({ hasAllergensInCatalog }: { hasAllergensInCatalog: boolean }) {
    const { t } = useTranslation("public");
    if (!hasAllergensInCatalog) return null;
    return (
        <div className={searchStyles.footer}>
            <button type="button" className={searchStyles.show} onClick={() => pushVenueSheet("filters")}>
                {t("allergens.filter_title")}
            </button>
        </div>
    );
}

/** Caratteristiche dal fondo: quelle del menu, con quanti piatti le hanno. */
export function CharacteristicsPage({ characteristics, groups }: MenuInfo) {
    const { t } = useTranslation("public");
    const entries = useMemo(() => characteristicEntries(characteristics, groups), [characteristics, groups]);
    return (
        <div className={styles.list}>
            <ul className={styles.plainList}>
                {entries.map(entry => (
                    <li key={entry.id} className={styles.infoRow} data-absent={entry.count === 0 || undefined}>
                        <span className={styles.rowIcon} aria-hidden>
                            <CharacteristicIcon icon={entry.icon} size={20} variant="bare" />
                        </span>
                        <span className={styles.rowText}>
                            <span className={styles.rowLabel}>{entry.label}</span>
                            <span className={styles.rowSubtitle}>
                                {entry.count > 0 ? t("page_end.in_dishes", { count: entry.count }) : t("page_end.not_in_menu")}
                            </span>
                        </span>
                    </li>
                ))}
            </ul>
            <p className={styles.note}>{t("characteristics.disclaimer")}</p>
        </div>
    );
}
