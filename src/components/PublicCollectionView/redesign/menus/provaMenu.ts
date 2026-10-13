import { useEffect, useState } from "react";
import type { PublicMenu, ResolvedCatalog, ResolvedCategory } from "@/types/resolvedCollections";

/**
 * `?prova-menu=1` (solo col flag): menu finti costruiti dal catalogo vero, per
 * provare «Scegli il menu» dal telefono prima che il giudice della fase (b)
 * mandi l'elenco. Le categorie principali si dividono in due menu di adesso;
 * un terzo, di più tardi, prende tutto il catalogo.
 */
export const PROVA_MENU_PARAM = "prova-menu";

function withChildren(roots: ResolvedCategory[], all: ResolvedCategory[]): ResolvedCategory[] {
    const ids = new Set(roots.map(c => c.id));
    // Le sottocategorie seguono il loro padre (un livello alla volta, finché ne entrano).
    let grew = true;
    while (grew) {
        grew = false;
        for (const c of all) {
            if (c.parent_category_id && ids.has(c.parent_category_id) && !ids.has(c.id)) {
                ids.add(c.id);
                grew = true;
            }
        }
    }
    return all.filter(c => ids.has(c.id));
}

function demoMenu(
    catalog: ResolvedCatalog,
    categories: ResolvedCategory[],
    menu: Pick<PublicMenu, "slug" | "name" | "sortOrder" | "startMinute" | "endMinute" | "state">
): PublicMenu {
    const products = categories.reduce((sum, c) => sum + c.products.filter(p => p.is_visible).length, 0);
    return {
        ...menu,
        catalogId: `${catalog.id}:${menu.slug}`,
        categoriesCount: categories.filter(c => !c.parent_category_id).length,
        productsCount: products,
        catalog: { ...catalog, id: `${catalog.id}:${menu.slug}`, name: menu.name, categories }
    };
}

export function demoMenus(catalog: ResolvedCatalog | undefined): PublicMenu[] | undefined {
    const all = catalog?.categories ?? [];
    const roots = all.filter(c => !c.parent_category_id).sort((a, b) => a.sort_order - b.sort_order);
    if (!catalog || roots.length < 2) return undefined;
    const half = Math.ceil(roots.length / 2);
    return [
        demoMenu(catalog, withChildren(roots.slice(0, half), all), {
            slug: "menu-pranzo",
            name: "Menu pranzo",
            sortOrder: 0,
            startMinute: 12 * 60,
            endMinute: 15 * 60,
            state: "now"
        }),
        demoMenu(catalog, withChildren(roots.slice(half), all), {
            slug: "carta-dei-vini",
            name: "Carta dei vini",
            sortOrder: 1,
            startMinute: 12 * 60,
            endMinute: 23 * 60,
            state: "now"
        }),
        demoMenu(catalog, all, {
            slug: "dessert-e-caffe",
            name: "Dessert e caffè",
            sortOrder: 2,
            startMinute: 15 * 60,
            endMinute: 23 * 60,
            state: "later"
        })
    ];
}

/** I menu finti, solo dopo il primo disegno: il server non vede la query. */
export function useDemoMenus(catalog: ResolvedCatalog | undefined, enabled: boolean): PublicMenu[] | undefined {
    const [menus, setMenus] = useState<PublicMenu[] | undefined>(undefined);
    useEffect(() => {
        if (!enabled || !new URLSearchParams(window.location.search).has(PROVA_MENU_PARAM)) return;
        setMenus(demoMenus(catalog));
    }, [catalog, enabled]);
    return menus;
}
