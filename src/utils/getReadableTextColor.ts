import Color from "color";

/**
 * Restituisce il miglior colore del testo (bianco, nero, quasi bianco, quasi nero)
 * in base allo sfondo passato.
 */
export function getReadableTextColor(bg: string): string {
    const color = Color(bg);
    const white = Color("#ffffff");
    const black = Color("#000000");
    const dark = Color("#111111");
    const light = Color("#f7f7f7");

    const contrastWhite = color.contrast(white); // rapporto contrasto bg vs bianco
    const contrastBlack = color.contrast(black); // rapporto contrasto bg vs nero
    const contrastDark = color.contrast(dark);
    const contrastLight = color.contrast(light);

    // scegli il colore con contrasto migliore (deve essere IL PIÙ ALTO)
    const best = Math.max(contrastWhite, contrastBlack, contrastDark, contrastLight);

    switch (best) {
        case contrastWhite:
            return "#ffffff";
        case contrastBlack:
            return "#000000";
        case contrastDark:
            return "#111111";
        default:
            return "#f7f7f7";
    }
}
