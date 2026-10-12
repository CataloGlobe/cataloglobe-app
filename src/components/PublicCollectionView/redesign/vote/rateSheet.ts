import i18next from "i18next";
import { openSheet, type SheetPage } from "../sheets/sheetStack";

/**
 * Pagina del voto nel foglio unico (spec §11): `rate:<voto>`, 0 = ancora da scegliere.
 * Il voto sta nella chiave, così una stella diversa è una pagina nuova e il
 * modulo riparte da quel voto. È la modale piccola cresciuta: niente riga di
 * testata, × sospesa; dall'invito entra già alta quanto la modale (`growFrom`).
 */
export const RATE_PREFIX = "rate:";

export function openRateSheet(rating?: number, growFrom?: number): void {
    const value = rating && rating >= 1 && rating <= 5 ? Math.round(rating) : 0;
    openSheet({
        key: `${RATE_PREFIX}${value}`,
        title: i18next.t("page_end.rate_title", { ns: "public" }),
        size: "large",
        floatingClose: true,
        growFrom
    });
}

/** Il voto scelto di una pagina `rate:`; undefined se non è la pagina del voto. */
export function rateOf(page: SheetPage): number | undefined {
    if (!page.key.startsWith(RATE_PREFIX)) return undefined;
    const value = Number(page.key.slice(RATE_PREFIX.length));
    return Number.isInteger(value) && value >= 0 && value <= 5 ? value : undefined;
}
