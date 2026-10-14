import { describe, expect, it } from "vitest";
import type { PublicMenu } from "@/types/resolvedCollections";
import {
    defaultMenu,
    findMenu,
    laterMenus,
    menuHours,
    menuIcon,
    nowMenus,
    shouldChoose
} from "@/components/PublicCollectionView/redesign/menus/menuList";

const menu = (over: Partial<PublicMenu> & Pick<PublicMenu, "slug">): PublicMenu => ({
    catalogId: `cat-${over.slug}`,
    name: over.slug,
    sortOrder: 0,
    startMinute: 12 * 60,
    endMinute: 15 * 60,
    state: "now",
    categoriesCount: 3,
    productsCount: 12,
    ...over
});

// I menu del mockup v38: pranzo, vini, bar adesso; dessert più tardi.
const pranzo = menu({ slug: "menu-pranzo", name: "Menu pranzo", sortOrder: 2 });
const vini = menu({ slug: "carta-dei-vini", name: "Carta dei vini", sortOrder: 0, endMinute: 23 * 60 });
const bar = menu({ slug: "menu-bar", name: "Menu bar", sortOrder: 1, startMinute: 7 * 60, endMinute: 19 * 60 });
const dessert = menu({ slug: "dessert", name: "Dessert e caffè", sortOrder: 3, state: "later", startMinute: 15 * 60, endMinute: 23 * 60 });
const tutti = [pranzo, vini, bar, dessert];

describe("elenco dei menu", () => {
    it("adesso: solo i menu `now`, nell'ordine dell'azienda (sort_order)", () => {
        expect(nowMenus(tutti).map(m => m.slug)).toEqual(["carta-dei-vini", "menu-bar", "menu-pranzo"]);
    });

    it("più tardi: solo i `later`, per ora di inizio e a pari ora per sort_order", () => {
        const cena = menu({ slug: "cena", state: "later", startMinute: 19 * 60, sortOrder: 0 });
        const aperitivo = menu({ slug: "aperitivo", state: "later", startMinute: 18 * 60, sortOrder: 5 });
        const pizza = menu({ slug: "pizza", state: "later", startMinute: 19 * 60, sortOrder: -1 });
        expect(laterMenus([...tutti, cena, aperitivo, pizza]).map(m => m.slug)).toEqual(["dessert", "aperitivo", "pizza", "cena"]);
    });

    it("senza elenco: niente", () => {
        expect(nowMenus(undefined)).toEqual([]);
        expect(laterMenus(undefined)).toEqual([]);
        expect(defaultMenu(undefined)).toBeUndefined();
    });

    it("il menu di partenza è il primo di adesso", () => {
        expect(defaultMenu(tutti)?.slug).toBe("carta-dei-vini");
        expect(defaultMenu([dessert])).toBeUndefined();
    });
});

describe("quando si mostra la scelta", () => {
    const normale = { preview: false };

    it("solo con più di un menu adesso", () => {
        expect(shouldChoose(tutti, normale)).toBe(true);
        // Uno adesso e uno più tardi: dritti nel menu.
        expect(shouldChoose([pranzo, dessert], normale)).toBe(false);
        expect(shouldChoose([pranzo], normale)).toBe(false);
        expect(shouldChoose(undefined, normale)).toBe(false);
    });

    it("mai nell'anteprima dello stile del back office", () => {
        expect(shouldChoose(tutti, { preview: true })).toBe(false);
    });
});

describe("menu da un link", () => {
    it("trova un menu di adesso dallo slug", () => {
        expect(findMenu(tutti, "menu-bar")?.catalogId).toBe("cat-menu-bar");
    });

    it("slug sconosciuto, vuoto o di un menu di più tardi: nessuno (si torna alla scelta)", () => {
        expect(findMenu(tutti, "inesistente")).toBeUndefined();
        expect(findMenu(tutti, "")).toBeUndefined();
        expect(findMenu(tutti, null)).toBeUndefined();
        expect(findMenu(tutti, "dessert")).toBeUndefined();
    });
});

describe("orario del menu", () => {
    it("ore e minuti con due cifre", () => {
        expect(menuHours(bar)).toBe("07:00-19:00");
        expect(menuHours(menu({ slug: "x", startMinute: 12 * 60 + 30, endMinute: 14 * 60 + 5 }))).toBe("12:30-14:05");
    });

    it("oltre la mezzanotte la fine riparte da 00:00", () => {
        expect(menuHours(menu({ slug: "notte", startMinute: 23 * 60, endMinute: 25 * 60 }))).toBe("23:00-01:00");
        expect(menuHours(menu({ slug: "tutto", startMinute: 0, endMinute: 24 * 60 }))).toBe("00:00-24:00");
    });
});

describe("icona del menu (D78)", () => {
    it("dal nome, in tutte le lingue", () => {
        expect(menuIcon(vini)).toBe("wine");
        expect(menuIcon(menu({ slug: "a", name: "Wine list" }))).toBe("wine");
        expect(menuIcon(menu({ slug: "b", name: "Weinkarte" }))).toBe("wine");
        expect(menuIcon(menu({ slug: "c", name: "La cantina" }))).toBe("wine");
        expect(menuIcon(bar)).toBe("coffee");
        expect(menuIcon(menu({ slug: "d", name: "Colazione" }))).toBe("coffee");
        expect(menuIcon(menu({ slug: "e", name: "Caffetteria" }))).toBe("coffee");
        expect(menuIcon(menu({ slug: "f", name: "Petit-déjeuner" }))).toBe("coffee");
        expect(menuIcon(menu({ slug: "g", name: "I nostri dolci" }))).toBe("cake");
        expect(menuIcon(menu({ slug: "h", name: "Postres" }))).toBe("cake");
        expect(menuIcon(pranzo)).toBe("utensils");
    });

    it("conta la prima parola che si riconosce", () => {
        expect(menuIcon(dessert)).toBe("cake");
        expect(menuIcon(menu({ slug: "i", name: "Vini e dolci" }))).toBe("wine");
    });

    it("parole intere dove serve: «barbecue» non è un bar", () => {
        expect(menuIcon(menu({ slug: "j", name: "Barbecue" }))).toBe("utensils");
        expect(menuIcon(menu({ slug: "l", name: "Tortellini e tortillas" }))).toBe("utensils");
        expect(menuIcon(menu({ slug: "m", name: "Torte della casa" }))).toBe("cake");
        // «Déjeuner» da solo è il pranzo, non la colazione.
        expect(menuIcon(menu({ slug: "n", name: "Déjeuner" }))).toBe("utensils");
    });

    it("nome che non dice niente: decide l'ora di inizio", () => {
        const autunno = (startMinute: number) => menuIcon(menu({ slug: "k", name: "Menu autunno", startMinute }));
        expect(autunno(8 * 60)).toBe("coffee");
        expect(autunno(11 * 60)).toBe("utensils");
        expect(autunno(17 * 60)).toBe("wine");
        expect(autunno(19 * 60)).toBe("utensils");
    });
});
