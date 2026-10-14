import type { PublicMenu, ResolvedCatalog } from "@/types/resolvedCollections";
import type { CollectionViewSectionGroup, CollectionViewSectionItem } from "@/components/PublicCollectionView/CollectionView/CollectionView";
import { findProductInGroups } from "@/components/PublicCollectionView/CollectionView/findProductInGroups";
import { defaultMenu, nowMenus } from "./menuList";

/**
 * Il catalogo di un menu. Il payload non ripete il primo menu di adesso: il suo
 * catalogo è `resolved.catalog` (`firstCatalog`).
 */
export function catalogOfMenu(
    menu: PublicMenu,
    menus: PublicMenu[] | undefined,
    firstCatalog: ResolvedCatalog | undefined
): ResolvedCatalog | undefined {
    if (menu.catalog) return menu.catalog;
    return defaultMenu(menus)?.catalogId === menu.catalogId ? firstCatalog : undefined;
}

/** I cataloghi degli altri menu di adesso, nell'ordine dell'azienda. */
export function otherNowCatalogs(
    menus: PublicMenu[] | undefined,
    shownCatalogId: string | undefined,
    firstCatalog: ResolvedCatalog | undefined
): ResolvedCatalog[] {
    return nowMenus(menus)
        .filter(menu => menu.catalogId !== shownCatalogId)
        .map(menu => catalogOfMenu(menu, menus, firstCatalog))
        .filter((catalog): catalog is ResolvedCatalog => catalog !== undefined);
}

/**
 * Si ordina da tutti i menu di adesso (piano 9b, passo 4; gli ordini li accetta
 * `validateOrderItems`): un piatto messo nel carrello da un altro menu resta
 * trovabile, quindi non diventa «Non più disponibile» cambiando menu.
 */
export function findInMenus(
    own: (productId: string) => CollectionViewSectionItem | null,
    otherGroups: CollectionViewSectionGroup[][]
): (productId: string) => CollectionViewSectionItem | null {
    if (otherGroups.length === 0) return own;
    return productId => {
        const found = own(productId);
        if (found) return found;
        for (const groups of otherGroups) {
            const other = findProductInGroups(groups, productId);
            if (other) return other;
        }
        return null;
    };
}
