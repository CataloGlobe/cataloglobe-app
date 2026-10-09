import { useMemo } from "react";
import type { V2Style } from "@/services/supabase/styles";
import { parseTokens, DEFAULT_STYLE_TOKENS } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import styles from "./StyleSwatch.module.scss";

/**
 * Il campione di uno stile: una pagina pubblica in miniatura (testata nel
 * primario, pillole di navigazione, due blocchi, il bottone nell'accento) sul
 * fondo della pagina. Due consumatori: l'elenco Stili e la card del menù
 * (§49.3, §50.13).
 *
 * I colori sono dati dello stile, quindi vivono negli attributi `fill`
 * dell'SVG e non in CSS inline. I grigi dei blocchi si scuriscono o si
 * schiariscono secondo il fondo, così il campione si legge anche sugli stili
 * scuri.
 */
type StyleSwatchProps = {
    style: Pick<V2Style, "current_version">;
    /** Versione da riga di tabella: più bassa, senza blocchi di contenuto. */
    compact?: boolean;
    /**
     * Il nome accessibile («Stile Estate»), quando il campione dice qualcosa
     * che il testo accanto non dice (la card del menù). Senza, è decorativo.
     */
    label?: string;
};

function isDark(hex: string): boolean {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return false;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

export type StylePalette = { background: string; primary: string; accent: string; muted: string };

/** I colori di uno stile come li vede il cliente: sfondo, colore principale, bottoni, testo. */
export function stylePalette(style: Pick<V2Style, "current_version"> | null): StylePalette {
    const tokens = style?.current_version?.config ? parseTokens(style.current_version.config) : DEFAULT_STYLE_TOKENS;
    const background = tokens.colors.pageBackground;
    return {
        background,
        primary: tokens.colors.primary,
        accent: tokens.colors.accent ?? tokens.colors.primary,
        muted: isDark(background) ? "#ffffff" : "#0f172a"
    };
}

export function StyleSwatch({ style, compact = false, label }: StyleSwatchProps) {
    const palette = useMemo(() => stylePalette(style), [style]);

    const a11y = label
        ? ({ role: "img", "aria-label": label } as const)
        : ({ "aria-hidden": true } as const);

    if (compact) {
        return (
            <svg className={styles.compact} viewBox="0 0 64 40" {...a11y} focusable="false">
                <rect width="64" height="40" fill={palette.background} />
                <rect width="64" height="8" fill={palette.primary} />
                <rect x="8" y="15" width="14" height="4" rx="2" fill={palette.primary} />
                <rect x="25" y="15" width="10" height="4" rx="2" fill={palette.muted} fillOpacity="0.12" />
                <rect x="8" y="29" width="18" height="5" rx="2.5" fill={palette.accent} />
            </svg>
        );
    }

    return (
        <svg className={styles.swatch} viewBox="0 0 160 100" preserveAspectRatio="none" {...a11y} focusable="false">
            <rect width="160" height="100" fill={palette.background} />
            <rect width="160" height="18" fill={palette.primary} />
            <rect x="12" y="28" width="22" height="5" rx="2.5" fill={palette.primary} />
            <rect x="38" y="28" width="16" height="5" rx="2.5" fill={palette.muted} fillOpacity="0.12" />
            <rect x="58" y="28" width="16" height="5" rx="2.5" fill={palette.muted} fillOpacity="0.12" />
            <rect x="12" y="42" width="136" height="16" rx="4" fill={palette.muted} fillOpacity="0.08" />
            <rect x="12" y="63" width="90" height="10" rx="3" fill={palette.muted} fillOpacity="0.08" />
            <rect x="12" y="82" width="36" height="7" rx="3.5" fill={palette.accent} />
        </svg>
    );
}
