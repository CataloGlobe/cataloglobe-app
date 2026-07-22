// Registrazione font per il PDF menu (Stage 3 + pass completamento famiglie).
// TTF statici OFL (regular + bold) da Google Fonts per tutte le famiglie
// dell'enum FontFamily. Patrick Hand non ha un peso bold reale: il weight 700
// registrato punta al TTF regular (niente faux-bold).
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
import montserratRegular from "@/assets/pdf-fonts/montserrat-400.ttf?url";
import montserratBold from "@/assets/pdf-fonts/montserrat-700.ttf?url";
import spectralRegular from "@/assets/pdf-fonts/spectral-400.ttf?url";
import spectralBold from "@/assets/pdf-fonts/spectral-700.ttf?url";
import loraRegular from "@/assets/pdf-fonts/lora-400.ttf?url";
import loraBold from "@/assets/pdf-fonts/lora-700.ttf?url";
import ebGaramondRegular from "@/assets/pdf-fonts/eb-garamond-400.ttf?url";
import ebGaramondBold from "@/assets/pdf-fonts/eb-garamond-700.ttf?url";
import patrickHandRegular from "@/assets/pdf-fonts/patrick-hand-400.ttf?url";

const FALLBACK_FAMILY = "Inter";

/** Token fontFamily → famiglia react-pdf registrata. Assente = fallback Inter. */
const REGISTERED_FAMILIES: Partial<Record<FontFamily, string>> = {
    inter: "Inter",
    poppins: "Poppins",
    raleway: "Raleway",
    "josefin-sans": "Josefin Sans",
    montserrat: "Montserrat",
    spectral: "Spectral",
    lora: "Lora",
    "eb-garamond": "EB Garamond",
    "patrick-hand": "Patrick Hand"
};

const FONT_SOURCES: Array<{ family: string; regular: string; bold: string }> = [
    { family: "Inter", regular: interRegular, bold: interBold },
    { family: "Poppins", regular: poppinsRegular, bold: poppinsBold },
    { family: "Raleway", regular: ralewayRegular, bold: ralewayBold },
    { family: "Josefin Sans", regular: josefinRegular, bold: josefinBold },
    { family: "Montserrat", regular: montserratRegular, bold: montserratBold },
    { family: "Spectral", regular: spectralRegular, bold: spectralBold },
    { family: "Lora", regular: loraRegular, bold: loraBold },
    { family: "EB Garamond", regular: ebGaramondRegular, bold: ebGaramondBold },
    // Patrick Hand: nessun peso bold reale — weight 700 punta al regular.
    { family: "Patrick Hand", regular: patrickHandRegular, bold: patrickHandRegular }
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
