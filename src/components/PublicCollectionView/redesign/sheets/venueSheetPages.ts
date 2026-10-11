import i18next from "i18next";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import { FEATURED_TYPE_KEY } from "../featured/stripItems";
import type { PublicSheetName } from "../slots";
import { openSheet, openSheetAt, pushSheetPage, type SheetPage } from "./sheetStack";

/**
 * Pagine del foglio del locale: Altre opzioni (⋯), Informazioni, Orari, Lingua. Il
 * titolo si legge nella lingua della pagina al momento dell'apertura.
 */
export function venueSheetPage(name: PublicSheetName): SheetPage {
    const t = (key: string) => i18next.t(key, { ns: "public" });
    switch (name) {
        case "more":
            return { key: "more", title: t("more.title"), size: "medium" };
        case "info":
            return { key: "info", title: t("info.title"), size: "large" };
        case "hours":
            return { key: "hours", title: t("opening_hours.title"), size: "large" };
        case "language":
            return { key: "language", title: t("language_selector.sheet_title"), size: "medium" };
        case "featured":
            return { key: "featured", title: t("hub.events"), size: "large" };
        case "categories":
            return { key: "categories", title: t("categories.sheet_title"), size: "large" };
        case "search":
            return { key: "search", title: t("search.back_to_search"), size: "large", fill: true };
        case "filters":
            return { key: "filters", title: t("search.filters_title"), size: "large", fill: true };
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
        openSheetAt([venueSheetPage("info"), venueSheetPage("hours")]);
        return;
    }
    openSheet(venueSheetPage(name));
}

/** Dentro il foglio: spinge la pagina (da ⋯ verso Informazioni o Orari). */
export function pushVenueSheet(name: PublicSheetName): void {
    pushSheetPage(venueSheetPage(name));
}
