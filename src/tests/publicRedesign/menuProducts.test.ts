import { describe, expect, it } from "vitest";
import type { PublicMenu, ResolvedCatalog } from "@/types/resolvedCollections";
import type {
    CollectionViewSectionGroup,
    CollectionViewSectionItem
} from "@/components/PublicCollectionView/CollectionView/CollectionView";
import {
    catalogOfMenu,
    findInMenus,
    otherNowCatalogs
} from "@/components/PublicCollectionView/redesign/menus/menuProducts";

const catalog = (id: string) => ({ id, name: id, categories: [] }) as unknown as ResolvedCatalog;

const menu = (over: Partial<PublicMenu> & Pick<PublicMenu, "catalogId">): PublicMenu => ({
    slug: over.catalogId,
    name: over.catalogId,
    sortOrder: 0,
    startMinute: 0,
    endMinute: 1440,
    state: "now",
    categoriesCount: 1,
    productsCount: 1,
    ...over
});

// Il payload non ripete il primo menu di adesso: il suo catalogo è `resolved.catalog`.
const first = catalog("c-vini");
const vini = menu({ catalogId: "c-vini", sortOrder: 0 });
const pranzo = menu({ catalogId: "c-pranzo", sortOrder: 1, catalog: catalog("c-pranzo") });
const cena = menu({ catalogId: "c-cena", sortOrder: 2, state: "later" });
const menus = [pranzo, cena, vini];

const item = (id: string) => ({ id, name: id }) as CollectionViewSectionItem;
const groups = (...ids: string[]) =>
    [{ root: { items: ids.map(item) }, children: [] }] as unknown as CollectionViewSectionGroup[];

describe("menuProducts", () => {
    it("il catalogo del primo menu di adesso è quello in cima al payload", () => {
        expect(catalogOfMenu(vini, menus, first)).toBe(first);
        expect(catalogOfMenu(pranzo, menus, first)?.id).toBe("c-pranzo");
        expect(catalogOfMenu(cena, menus, first)).toBeUndefined();
    });

    it("gli altri menu di adesso, senza quello mostrato né quelli di più tardi", () => {
        expect(otherNowCatalogs(menus, "c-vini", first).map(c => c.id)).toEqual(["c-pranzo"]);
        expect(otherNowCatalogs(menus, "c-pranzo", first).map(c => c.id)).toEqual(["c-vini"]);
        expect(otherNowCatalogs(undefined, undefined, first)).toEqual([]);
    });

    it("un piatto del carrello preso da un altro menu resta trovabile", () => {
        const own = (id: string) => (id === "p-vino" ? item(id) : null);
        const find = findInMenus(own, [groups("p-pasta"), groups("p-dolce")]);
        expect(find("p-vino")?.id).toBe("p-vino");
        expect(find("p-pasta")?.id).toBe("p-pasta");
        expect(find("p-dolce")?.id).toBe("p-dolce");
        expect(find("p-altro")).toBeNull();
    });

    it("con un menu solo resta la ricerca di oggi", () => {
        const own = (id: string) => item(id);
        expect(findInMenus(own, [])).toBe(own);
    });
});
