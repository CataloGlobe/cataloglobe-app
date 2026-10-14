import i18next from "i18next";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import { FEATURED_TYPE_KEY } from "../featured/stripItems";
import { ALL_CATEGORIES_ID, ISLAND_ID, LANGUAGE_BUTTON_ID, MENU_BUTTON_ID, MORE_BUTTON_ID, SEARCH_FIELD_ID } from "../island/anchors";
import type { PublicSheetName } from "../slots";
import { openSheet, openSheetAt, pushSheetPage, type SheetPage } from "./sheetStack";

/**
 * Pagine del foglio del locale: Altre opzioni (⋯), Informazioni, Orari, Lingua. Il
 * titolo si legge nella lingua della pagina al momento dell'apertura.
 */
/** Su desktop ⋯, lingua e «Tutte le categorie» si aprono sotto il loro pulsante (spec §13). */
const POPOVER_WIDTH_PX = 320;

/** Accento bianco come nel mockup (D68): opzioni, informazioni, lingua, categorie, filtri. */
const NEUTRAL_SHEETS: ReadonlySet<PublicSheetName> = new Set([
    "more",
    "info",
    "hours",
    "language",
    "categories",
    "filters",
    "allergens",
    "characteristics",
    "menus"
]);

export function venueSheetPage(name: PublicSheetName): SheetPage {
    const page = venueSheetBase(name);
    return NEUTRAL_SHEETS.has(name) ? { ...page, accent: "neutral" } : page;
}

function venueSheetBase(name: PublicSheetName): SheetPage {
    const t = (key: string) => i18next.t(key, { ns: "public" });
    switch (name) {
        case "more":
            return {
                key: "more",
                title: t("more.sheet_title"),
                size: "medium",
                anchor: { below: MORE_BUTTON_ID, width: POPOVER_WIDTH_PX }
            };
        case "info":
            return { key: "info", title: t("info.sheet_title"), size: "large" };
        case "hours":
            return { key: "hours", title: t("opening_hours.week_title"), size: "large" };
        case "language":
            return {
                key: "language",
                title: t("language_selector.sheet_title"),
                size: "medium",
                anchor: { below: LANGUAGE_BUTTON_ID, width: POPOVER_WIDTH_PX }
            };
        case "featured":
            return { key: "featured", title: t("hub.events"), size: "large", named: true };
        case "categories":
            return {
                key: "categories",
                title: t("categories.sheet_title"),
                size: "large",
                anchor: { below: ALL_CATEGORIES_ID, width: POPOVER_WIDTH_PX }
            };
        case "search":
            return {
                key: "search",
                title: t("search.back_to_search"),
                size: "large",
                fill: true,
                // Su desktop a tendina sotto il campo dell'isola (spec §13).
                anchor: { below: ISLAND_ID, align: SEARCH_FIELD_ID, inset: 12 }
            };
        case "filters":
            return { key: "filters", title: t("search.filters_title"), size: "large", fill: true };
        case "allergens":
            return { key: "allergens", title: t("allergens.title"), size: "large" };
        case "characteristics":
            return { key: "characteristics", title: t("characteristics.title"), size: "large" };
        case "menus":
            return {
                key: "menus",
                title: t("menus.sheet_title"),
                size: "medium",
                anchor: { below: MENU_BUTTON_ID, width: POPOVER_WIDTH_PX }
            };
        case "order":
            // Il titolo sta nel corpo, col tavolo: «Il tuo ordine · Tavolo 12».
            return { key: "order", title: t("ordering.title"), size: "large", titleHidden: true };
    }
}

/** Prefisso della pagina di dettaglio di un contenuto in evidenza (`featured:<id>`). */
export const FEATURED_DETAIL_PREFIX = "featured:";

// In testata il tipo («Evento»), non il titolo: il corpo si apre già col titolo.
function featuredDetailPage(block: V2FeaturedContent): SheetPage {
    const title = i18next.t(FEATURED_TYPE_KEY[block.content_type], { ns: "public" });
    return { key: `${FEATURED_DETAIL_PREFIX}${block.id}`, title, size: "large" };
}

/** Dalla card del carosello: il dettaglio da solo, senza elenco sotto (spec §9, v33). */
export function openFeaturedDetail(block: V2FeaturedContent): void {
    openSheet(featuredDetailPage(block));
}

/** Dall'elenco «In evidenza»: il dettaglio entra a spinta, con «‹ In evidenza». */
export function pushFeaturedDetail(block: V2FeaturedContent): void {
    pushSheetPage(featuredDetailPage(block));
}

/**
 * Apre il foglio per nome. Orari si apre già sulla figlia con Informazioni
 * sotto: «‹ Informazioni» porta al resto (spec §2 e §5, v25 e v30).
 */
export function openVenueSheet(name: PublicSheetName): void {
    if (name === "hours") {
        // Link diretto: la madre si nomina, «‹ Info e orari» (mockup v38).
        openSheetAt([{ ...venueSheetPage("info"), named: true }, venueSheetPage("hours")]);
        return;
    }
    openSheet(venueSheetPage(name));
}

/** Dentro il foglio: spinge la pagina (da ⋯ verso Informazioni o Orari). */
export function pushVenueSheet(name: PublicSheetName): void {
    pushSheetPage(venueSheetPage(name));
}
