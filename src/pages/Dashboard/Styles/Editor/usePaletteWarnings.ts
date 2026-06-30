import { useMemo } from "react";
import { converter } from "culori";

export type PaletteWarningId =
    | "primary-background-similar"
    | "primary-low-chroma";

export type PaletteWarning = {
    id: PaletteWarningId;
    message: string;
    affectedFields: Array<"primary" | "pageBackground">;
};

const toOklch = converter("oklch");

type Colors = {
    primary: string;
    pageBackground: string;
};

export function usePaletteWarnings(colors: Colors): PaletteWarning[] {
    return useMemo(() => {
        const warnings: PaletteWarning[] = [];

        const primary = toOklch(colors.primary);
        const pageBackground = toOklch(colors.pageBackground);

        if (!primary || !pageBackground) return warnings;

        const deltaLPrimBg = Math.abs((primary.l ?? 0) - (pageBackground.l ?? 0));
        if (deltaLPrimBg < 0.15) {
            warnings.push({
                id: "primary-background-similar",
                message:
                    "Il colore primario e lo sfondo pagina hanno luminosità simile. Navigazione attiva, eyebrow di categoria e marchio potrebbero risultare poco distinguibili dallo sfondo.",
                affectedFields: ["primary", "pageBackground"]
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
    }, [colors.primary, colors.pageBackground]);
}
