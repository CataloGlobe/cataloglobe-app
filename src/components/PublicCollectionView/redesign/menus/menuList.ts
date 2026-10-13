/**
 * Regole pure della pagina «Scegli il menu» (spec §12, mockup v38). Test:
 * `src/tests/publicRedesign/menuList.test.ts`.
 */
import type { PublicMenu } from "@/types/resolvedCollections";

/** I menu di adesso, nell'ordine dell'azienda (M16): è l'ordine delle card. */
export function nowMenus(menus: PublicMenu[] | undefined): PublicMenu[] {
    return (menus ?? []).filter(m => m.state === "now").sort((a, b) => a.sortOrder - b.sortOrder);
}

/** «Più tardi»: solo oggi, per ora di inizio e a pari ora `sort_order` (scelta 1 del 2026-10-13). */
export function laterMenus(menus: PublicMenu[] | undefined): PublicMenu[] {
    return (menus ?? [])
        .filter(m => m.state === "later")
        .sort((a, b) => a.startMinute - b.startMinute || a.sortOrder - b.sortOrder);
}

/** Il menu che si apre senza scelta: il primo di adesso. */
export function defaultMenu(menus: PublicMenu[] | undefined): PublicMenu | undefined {
    return nowMenus(menus)[0];
}

/**
 * La scelta si mostra solo con più di un menu adesso (v38, riconfermato da Lorenzo
 * il 2026-10-13); mai nell'anteprima dello stile nel back office (`mode="preview"`).
 * Il tavolo in manutenzione spegne solo gli ordini: il menu si sceglie lo stesso.
 * Un hub per tutti, se un giorno servirà, si accende qui.
 */
export function shouldChoose(menus: PublicMenu[] | undefined, mode: { preview: boolean }): boolean {
    if (mode.preview) return false;
    return nowMenus(menus).length > 1;
}

/** Il menu di `?menu=`; solo tra quelli di adesso: uno di più tardi non si apre ancora. */
export function findMenu(menus: PublicMenu[] | undefined, slug: string | null | undefined): PublicMenu | undefined {
    if (!slug) return undefined;
    return nowMenus(menus).find(m => m.slug === slug);
}

const hhmm = (minute: number) =>
    `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** «12:00-15:00»; oltre la mezzanotte la fine riparte da 00:00, la mezzanotte esatta resta 24:00. */
export function menuHours(menu: Pick<PublicMenu, "startMinute" | "endMinute">): string {
    const end = menu.endMinute > 1440 ? menu.endMinute - 1440 : menu.endMinute;
    return `${hhmm(menu.startMinute)}-${hhmm(end)}`;
}

export type MenuIcon = "utensils" | "wine" | "coffee" | "cake";

/**
 * Parole del nome in 5 lingue (D78, deciso da Lorenzo il 2026-10-13): `stems` vale
 * come inizio di parola, `words` solo come parola intera («bar» sì, «barbecue» no).
 */
const ICON_WORDS: ReadonlyArray<{ icon: MenuIcon; stems: string[]; words: string[] }> = [
    {
        icon: "wine",
        stems: ["vin", "wein", "cantin", "bodeg", "cocktail", "aperitiv", "aperitif", "spritz", "birr", "bier", "cervez", "drink"],
        words: ["wine", "wines", "beer", "beers", "biere", "bieres", "cave"]
    },
    {
        icon: "coffee",
        stems: ["caff", "cafe", "coffee", "kaffee", "colazion", "breakfast", "fruhstuck", "desayun", "brunch"],
        // «petit» per petit-déjeuner: «déjeuner» da solo è il pranzo.
        words: ["bar", "petit"]
    },
    {
        icon: "cake",
        stems: ["dolc", "dessert", "postre", "nachspeis", "nachtisch", "pasticc", "patisser", "gelat", "kuchen", "sweet"],
        // Parole intere: «tort» prenderebbe anche tortellini e tortilla.
        words: ["torta", "torte", "torten", "tortas"]
    }
];

const wordsOf = (name: string) =>
    name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter(Boolean);

/**
 * L'icona della card (D78): dalla prima parola del nome che si riconosce; se il nome
 * non dice niente, dall'ora di inizio (prima delle 11 caffè, 17-19 vino, il resto posate).
 * Se un giorno il back office farà scegliere l'icona, questa resta la riserva.
 */
export function menuIcon(menu: Pick<PublicMenu, "name" | "startMinute">): MenuIcon {
    for (const word of wordsOf(menu.name)) {
        const hit = ICON_WORDS.find(g => g.words.includes(word) || g.stems.some(s => word.startsWith(s)));
        if (hit) return hit.icon;
    }
    if (menu.startMinute < 11 * 60) return "coffee";
    if (menu.startMinute >= 17 * 60 && menu.startMinute < 19 * 60) return "wine";
    return "utensils";
}
