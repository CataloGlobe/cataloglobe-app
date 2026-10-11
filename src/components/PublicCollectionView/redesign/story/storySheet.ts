import { getSheetState, pushSheetPage, type SheetPage } from "../sheets/sheetStack";

/** Prefisso della pagina di una storia nel foglio unico (`story:<id>`). */
export const STORY_PAGE_PREFIX = "story:";

/** Quello che la scheda sa già della storia: copertina e titolo si vedono prima che arrivi il racconto. */
export type StoryRef = { id: string; title: string; cover: string | null };

// La chiave porta solo l'id: copertina e titolo si ricordano qui, alla spinta.
const refs = new Map<string, StoryRef>();

/** Il titolo sta nel corpo; in testata resta per i lettori di schermo. */
export function storySheetPage(ref: StoryRef): SheetPage {
    return { key: `${STORY_PAGE_PREFIX}${ref.id}`, title: ref.title, size: "large", titleHidden: true };
}

/** Dalla scheda prodotto: la storia entra a spinta, con «‹ Nome del piatto» (spec §6). */
export function pushStorySheet(ref: StoryRef): void {
    refs.set(ref.id, ref);
    if (ref.cover && typeof Image !== "undefined") new Image().src = ref.cover;
    pushSheetPage(storySheetPage(ref));
}

/** Il lettore, a parte: si chiede quando la scheda ha una storia, così la spinta non arriva su una pagina vuota. */
export const loadStoryPage = () => import("./StoryPage");

/** La pagina sotto la storia, se è una scheda prodotto: da leggere all'apertura (durante l'uscita la storia non è più in pila). */
export function pageBelow(key: string): SheetPage | null {
    const pages = getSheetState().pages;
    const at = pages.findIndex(page => page.key === key);
    return at > 0 ? pages[at - 1] : null;
}

export function storyRefOf(page: SheetPage): StoryRef | null {
    if (!page.key.startsWith(STORY_PAGE_PREFIX)) return null;
    const id = page.key.slice(STORY_PAGE_PREFIX.length);
    return refs.get(id) ?? { id, title: page.title, cover: null };
}
