import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import AllergenFilterBody from "@components/PublicCollectionView/AllergenFilterBody/AllergenFilterBody";
import rowStyles from "@components/PublicCollectionView/AllergenFilterBody/AllergenFilterBody.module.scss";
import CharacteristicIcon from "@components/ui/CharacteristicIcon/CharacteristicIcon";
import Text from "@components/ui/Text/Text";
import type { CollectionViewSectionGroup } from "@components/PublicCollectionView/CollectionView/CollectionView";
import type { SheetsSlotContext } from "../slots";
import { closeSheet, getSheetState, popSheetPage } from "../sheets/sheetStack";
import {
    GLUTEN_FREE_ICON,
    PREFERENCE_ICON,
    menuPreferences,
    clearPreferences,
    togglePreference,
    usePreferences
} from "./preferences";
import styles from "./Search.module.scss";

type SearchContext = SheetsSlotContext["search"];

type Props = SearchContext & {
    /** Il menu intero, senza i filtri del cliente: dice quali preferenze hanno piatti. */
    groups: CollectionViewSectionGroup[];
};

/** «Senza glutine» è l'allergene Glutine in esclusione (spec §4: lo stesso filtro). */
const GLUTEN_CODE = "gluten";

/**
 * Pagina «Filtri» (spec §4): una pagina sola che scorre, prima le preferenze
 * (Vegetariano, Vegano, Senza glutine, Piccante), poi gli allergeni in
 * esclusione. Dal vivo: niente «Applica», ogni tocco filtra subito il menu.
 * Si mostrano solo le preferenze che hanno almeno un piatto nel menu.
 */
export function FiltersPage({ groups, allergens, appliedFilterIds, onApplyFilters }: Props) {
    const { t } = useTranslation("public");
    const preferences = usePreferences();
    const available = useMemo(() => menuPreferences(groups), [groups]);
    const gluten = allergens.find(a => a.code === GLUTEN_CODE);

    const toggle = (id: number) =>
        onApplyFilters(appliedFilterIds.includes(id) ? appliedFilterIds.filter(v => v !== id) : [...appliedFilterIds, id]);

    const rows = [
        ...available.filter(key => key !== "spicy").map(key => ({
            key,
            icon: PREFERENCE_ICON[key],
            selected: preferences.includes(key),
            onToggle: () => togglePreference(key)
        })),
        ...(gluten
            ? [{ key: "gluten_free", icon: GLUTEN_FREE_ICON, selected: appliedFilterIds.includes(gluten.id), onToggle: () => toggle(gluten.id) }]
            : []),
        ...(available.includes("spicy")
            ? [{ key: "spicy", icon: PREFERENCE_ICON.spicy, selected: preferences.includes("spicy"), onToggle: () => togglePreference("spicy") }]
            : [])
    ];

    return (
        <div className={styles.filters}>
            {rows.length > 0 && (
                <section className={styles.filterGroup} aria-labelledby="filters-preferences">
                    <h3 id="filters-preferences" className={styles.filterGroupTitle}>
                        {t("search.preferences_title")}
                    </h3>
                    <Text variant="body-sm" className={rowStyles.filterIntro} color="var(--pub-surface-text-muted)">
                        {t("search.preferences_intro")}
                    </Text>
                    <ul className={rowStyles.list}>
                        {rows.map(row => (
                            <li key={row.key}>
                                <button
                                    type="button"
                                    onClick={row.onToggle}
                                    className={`${rowStyles.filterRow} ${row.selected ? rowStyles.filterRowSelected : ""}`}
                                    aria-pressed={row.selected}
                                >
                                    <span className={rowStyles.iconWrap} aria-hidden>
                                        <CharacteristicIcon icon={row.icon} size={20} variant="bare" />
                                    </span>
                                    <span className={rowStyles.label}>{t(`search.preference.${row.key}`)}</span>
                                    <span className={rowStyles.checkbox} aria-hidden>
                                        {row.selected && <Check size={12} strokeWidth={3} />}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            <section className={styles.filterGroup} aria-labelledby="filters-allergens">
                <h3 id="filters-allergens" className={styles.filterGroupTitle}>
                    {t("allergens.title")}
                </h3>
                <AllergenFilterBody allergens={allergens} selectedIds={appliedFilterIds} onToggle={toggle} />
            </section>
        </div>
    );
}

/** Piede dei Filtri: «Azzera» e «Mostra N piatti», col numero dal vivo. */
export function FiltersFooter({ appliedFilterIds, onApplyFilters, visibleProductCount }: SearchContext) {
    const { t } = useTranslation("public");
    const preferences = usePreferences();
    // Dalla ricerca si torna ai risultati; da soli o dal ⋯, il foglio si chiude sul menu.
    const show = () => {
        const pages = getSheetState().pages;
        if (pages[pages.length - 2]?.key === "search") popSheetPage();
        else closeSheet();
    };
    const reset = () => {
        onApplyFilters([]);
        clearPreferences();
    };
    return (
        <div className={styles.footer}>
            <button
                type="button"
                className={styles.reset}
                onClick={reset}
                disabled={appliedFilterIds.length === 0 && preferences.length === 0}
            >
                {t("search.reset")}
            </button>
            <button type="button" className={styles.show} onClick={show}>
                {t("search.show_count", { count: visibleProductCount })}
            </button>
        </div>
    );
}
