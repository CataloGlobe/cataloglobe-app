// Registrazione font per il PDF menu (Stage 3).
// TTF statici OFL (regular + bold) da Google Fonts per le famiglie realmente
// usate dagli stili su staging (inter, poppins, raleway, josefin-sans) più il
// default. Le altre famiglie dell'enum (montserrat, spectral, lora,
// eb-garamond, patrick-hand) ricadono su Inter finché non arriva il pass di
// completamento famiglie.
//
// Questo modulo importa @react-pdf/renderer: va tenuto nel chunk lazy
// (importarlo solo da renderMenuPdf/MenuPdfDocument, mai da codice eager).
import { Font } from "@react-pdf/renderer";
import type { FontFamily } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";

import interRegular from "@/assets/pdf-fonts/inter-400.ttf?url";
import interBold from "@/assets/pdf-fonts/inter-700.ttf?url";
import poppinsRegular from "@/assets/pdf-fonts/poppins-400.ttf?url";
import poppinsBold from "@/assets/pdf-fonts/poppins-700.ttf?url";
import ralewayRegular from "@/assets/pdf-fonts/raleway-400.ttf?url";
import ralewayBold from "@/assets/pdf-fonts/raleway-700.ttf?url";
import josefinRegular from "@/assets/pdf-fonts/josefin-sans-400.ttf?url";
import josefinBold from "@/assets/pdf-fonts/josefin-sans-700.ttf?url";

const FALLBACK_FAMILY = "Inter";

/** Token fontFamily → famiglia react-pdf registrata. Assente = fallback Inter. */
const REGISTERED_FAMILIES: Partial<Record<FontFamily, string>> = {
    inter: "Inter",
    poppins: "Poppins",
    raleway: "Raleway",
    "josefin-sans": "Josefin Sans"
};

const FONT_SOURCES: Array<{ family: string; regular: string; bold: string }> = [
    { family: "Inter", regular: interRegular, bold: interBold },
    { family: "Poppins", regular: poppinsRegular, bold: poppinsBold },
    { family: "Raleway", regular: ralewayRegular, bold: ralewayBold },
    { family: "Josefin Sans", regular: josefinRegular, bold: josefinBold }
];

let registered = false;

/** Idempotente: chiamare una volta prima di costruire il documento. */
export function registerPdfFonts(): void {
    if (registered) return;
    for (const source of FONT_SOURCES) {
        Font.register({
            family: source.family,
            fonts: [
                { src: source.regular, fontWeight: 400 },
                { src: source.bold, fontWeight: 700 }
            ]
        });
    }
    registered = true;
}

export function resolvePdfFontFamily(value: FontFamily): string {
    return REGISTERED_FAMILIES[value] ?? FALLBACK_FAMILY;
}
