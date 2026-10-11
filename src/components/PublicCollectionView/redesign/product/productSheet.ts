import type { CollectionViewSectionItem } from "@/components/PublicCollectionView/CollectionView/CollectionView";
import { openSheet, pushSheetPage, type SheetPage } from "../sheets/sheetStack";

/** Prefisso della pagina di un prodotto nel foglio unico (`product:<id>`). */
export const PRODUCT_PAGE_PREFIX = "product:";

/** Voci a vista prima di «Mostra tutti»: gruppi di scelte e ingredienti (spec §6). */
export const VISIBLE_ROWS = 5;

type OptionGroup = NonNullable<CollectionViewSectionItem["optionGroups"]>[number];

/**
 * Regola di un gruppo di scelte, nel titolo e senza minimo (spec §6, v26):
 * «scegli 1», «fino a N · obbligatoria», «facoltativa». Chiave i18n + numero.
 */
export function groupRule(group: Pick<OptionGroup, "isRequired" | "maxSelectable">): {
    key: string;
    count?: number;
} {
    const max = group.maxSelectable;
    if (group.isRequired) {
        if (max === 1) return { key: "product_sheet.rule_pick_one" };
        if (max != null && max > 1) return { key: "product_sheet.rule_up_to_required", count: max };
        return { key: "product_sheet.rule_required" };
    }
    if (max != null && max > 1) return { key: "product_sheet.rule_up_to_optional", count: max };
    return { key: "product_sheet.rule_optional" };
}

/** Pagina del prodotto: il nome sta nel corpo su due righe, in testata solo per «‹ Nome» e i lettori di schermo. */
export function productSheetPage(item: Pick<CollectionViewSectionItem, "id" | "name">): SheetPage {
    return { key: `${PRODUCT_PAGE_PREFIX}${item.id}`, title: item.name, size: "large", titleHidden: true };
}

export function productIdOf(page: SheetPage): string | null {
    return page.key.startsWith(PRODUCT_PAGE_PREFIX) ? page.key.slice(PRODUCT_PAGE_PREFIX.length) : null;
}

/** Dal menu, dalla ricerca o da un link: la scheda da sola. */
export function openProductSheet(item: Pick<CollectionViewSectionItem, "id" | "name">): void {
    openSheet(productSheetPage(item));
}

/** Da «Perfetto con»: l'altro prodotto entra a spinta, con «‹ Nome». */
export function pushProductSheet(item: Pick<CollectionViewSectionItem, "id" | "name">): void {
    pushSheetPage(productSheetPage(item));
}
