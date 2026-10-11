import type { V2Style } from "@/services/supabase/styles";
import { parseTokens, DEFAULT_STYLE_TOKENS } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";

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
