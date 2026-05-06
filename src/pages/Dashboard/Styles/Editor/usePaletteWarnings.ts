import { useMemo } from "react";
import { converter } from "culori";

export type PaletteWarningId =
    | "primary-surface-similar"
    | "primary-low-chroma";

export type PaletteWarning = {
    id: PaletteWarningId;
    message: string;
    affectedFields: Array<"primary" | "surface">;
};

const toOklch = converter("oklch");

type Colors = {
    primary: string;
    surface: string;
};

export function usePaletteWarnings(colors: Colors): PaletteWarning[] {
    return useMemo(() => {
        const warnings: PaletteWarning[] = [];

        const primary = toOklch(colors.primary);
        const surface = toOklch(colors.surface);

        if (!primary || !surface) return warnings;

        const deltaLPrimSurf = Math.abs((primary.l ?? 0) - (surface.l ?? 0));
        if (deltaLPrimSurf < 0.15) {
            warnings.push({
                id: "primary-surface-similar",
                message:
                    "Il colore primario e lo sfondo superfici hanno luminosità simile. I contenuti in evidenza in stile Highlight potrebbero risultare poco distinguibili dalle card normali.",
                affectedFields: ["primary", "surface"]
            });
        }

        const primaryChroma = primary.c ?? 0;
        if (primaryChroma < 0.05) {
            warnings.push({
                id: "primary-low-chroma",
                message:
                    "Il colore primario scelto è poco saturo. Pulsanti, badge e contenuti in evidenza potrebbero risultare poco visibili.",
                affectedFields: ["primary"]
            });
        }

        return warnings;
    }, [colors.primary, colors.surface]);
}
