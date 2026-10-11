import i18next from "i18next";
import type { PublicSheetName } from "../slots";
import { openSheet, openSheetAt, pushSheetPage, type SheetPage } from "./sheetStack";

/**
 * Pagine del foglio del locale: Altre opzioni (⋯), Informazioni, Orari. Il
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
    }
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
