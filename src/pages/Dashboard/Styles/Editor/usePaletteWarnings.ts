import { useMemo } from "react";
import { converter } from "culori";
import { deriveSurface } from "@/features/public/utils/mapStyleTokensToCssVars";

export type PaletteWarningId =
    | "primary-background-similar"
    | "accent-surface-similar";

export type PaletteWarning = {
    id: PaletteWarningId;
    message: string;
    affectedFields: Array<"primary" | "pageBackground" | "accent" | "surface">;
};

const toOklch = converter("oklch");

// Soglia di contrasto-luminanza sotto cui due colori risultano poco distinguibili.
const LOW_CONTRAST_DELTA_L = 0.15;

type Colors = {
    primary: string;
    pageBackground: string;
    /** accent RAW: undefined = collegato al primario (l'avviso accent non si applica). */
    accent?: string;
};

export function usePaletteWarnings(colors: Colors): PaletteWarning[] {
    return useMemo(() => {
        const warnings: PaletteWarning[] = [];

        const primary = toOklch(colors.primary);
        const pageBackground = toOklch(colors.pageBackground);
        if (!primary || !pageBackground) return warnings;

        // Avviso A — primario vs sfondo pagina (identità: nav, categorie, marchio vivono sullo sfondo).
        const deltaLPrimBg = Math.abs((primary.l ?? 0) - (pageBackground.l ?? 0));
        if (deltaLPrimBg < LOW_CONTRAST_DELTA_L) {
            warnings.push({
                id: "primary-background-similar",
                message:
                    "Il colore primario è troppo simile allo sfondo pagina: navigazione, categorie e marchio potrebbero risultare poco leggibili.",
                affectedFields: ["primary", "pageBackground"]
            });
        }

        // Avviso B — accent vs superficie card (azione: i pulsanti prodotto vivono sulle card).
        // Solo se accent è SCOLLEGATO (raw definito); se collegato lo copre l'avviso A.
        if (colors.accent) {
            const accent = toOklch(colors.accent);
            const surface = toOklch(deriveSurface(colors.pageBackground));
            if (accent && surface) {
                const deltaLAccentSurface = Math.abs((accent.l ?? 0) - (surface.l ?? 0));
                if (deltaLAccentSurface < LOW_CONTRAST_DELTA_L) {
                    warnings.push({
                        id: "accent-surface-similar",
                        message:
                            "Il colore accent ha poco contrasto con le card: i pulsanti dei prodotti potrebbero risultare poco visibili.",
                        affectedFields: ["accent", "surface"]
                    });
                }
            }
        }

        return warnings;
    }, [colors.primary, colors.pageBackground, colors.accent]);
}
