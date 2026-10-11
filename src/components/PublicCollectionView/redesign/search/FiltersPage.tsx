import { useTranslation } from "react-i18next";
import AllergenFilterBody from "@components/PublicCollectionView/AllergenFilterBody/AllergenFilterBody";
import type { SheetsSlotContext } from "../slots";
import { closeSheet, getSheetState, popSheetPage } from "../sheets/sheetStack";
import styles from "./Search.module.scss";

type SearchContext = SheetsSlotContext["search"];

/**
 * Pagina «Filtri» (spec §4): una pagina sola che scorre, gli allergeni in
 * esclusione, dal vivo (niente «Applica»: ogni tocco filtra subito il menu).
 * Le preferenze (Vegetariano, Vegano…) aspettano un campo nei dati del prodotto.
 */
export function FiltersPage({ allergens, appliedFilterIds, onApplyFilters }: SearchContext) {
    const toggle = (id: number) =>
        onApplyFilters(appliedFilterIds.includes(id) ? appliedFilterIds.filter(v => v !== id) : [...appliedFilterIds, id]);
    return <AllergenFilterBody allergens={allergens} selectedIds={appliedFilterIds} onToggle={toggle} className={styles.filters} />;
}

/** Piede dei Filtri: «Azzera» e «Mostra N piatti», col numero dal vivo. */
export function FiltersFooter({ appliedFilterIds, onApplyFilters, visibleProductCount }: SearchContext) {
    const { t } = useTranslation("public");
    // Dalla ricerca si torna ai risultati; da soli o dal ⋯, il foglio si chiude sul menu.
    const show = () => {
        const pages = getSheetState().pages;
        if (pages[pages.length - 2]?.key === "search") popSheetPage();
        else closeSheet();
    };
    return (
        <div className={styles.footer}>
            <button
                type="button"
                className={styles.reset}
                onClick={() => onApplyFilters([])}
                disabled={appliedFilterIds.length === 0}
            >
                {t("search.reset")}
            </button>
            <button type="button" className={styles.show} onClick={show}>
                {t("search.show_count", { count: visibleProductCount })}
            </button>
        </div>
    );
}
