import { useEffect } from "react";
import {
    parseTokens,
    DEFAULT_STYLE_TOKENS,
    type StyleTokenModel
} from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import type { ResolvedStyle } from "@/services/supabase/resolveActivityCatalogs";

// ─────────────────────────────────────────────────────────────────────────────
// CSS variable namespace consumed by all public components.
// These are deliberately separate from the dashboard theme vars.
// ─────────────────────────────────────────────────────────────────────────────
const RUNTIME_VAR_KEYS = [
    "--pub-bg",
    "--pub-primary",
    "--pub-header-bg",
    "--pub-header-radius",
    "--pub-font-family",
    "--pub-card-bg",
    "--pub-card-radius",
    "--pub-nav-style"
] as const;

type RuntimeVarKey = (typeof RUNTIME_VAR_KEYS)[number];

function buildVarMap(tokens: StyleTokenModel): Record<RuntimeVarKey, string> {
    return {
        "--pub-bg": tokens.colors.pageBackground,
        "--pub-primary": tokens.colors.primary,
        "--pub-header-bg": tokens.colors.headerBackground,
        "--pub-header-radius": `${tokens.header.imageBorderRadiusPx}px`,
        "--pub-font-family":
            tokens.typography.fontFamily === "poppins"
                ? "'Poppins', sans-serif"
                : tokens.typography.fontFamily === "playfair"
                  ? "'Playfair Display', serif"
                  : "'Inter', sans-serif",
        // card vars
        "--pub-card-bg": "#ffffff",
        "--pub-card-radius": tokens.card.radius === "sharp" ? "0px" : "14px",
        "--pub-nav-style": tokens.navigation.style
    };
}

function applyVars(vars: Record<RuntimeVarKey, string>): void {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
        root.style.setProperty(key, value);
    }
}

function clearVars(): void {
    const root = document.documentElement;
    for (const key of RUNTIME_VAR_KEYS) {
        root.style.removeProperty(key);
    }
}

/**
 * Injects runtime CSS variables onto :root derived from the active schedule's
 * style payload. Falls back to DEFAULT_STYLE_TOKENS when style is null.
 *
 * Variables are scoped under the `--pub-*` namespace to avoid collisions with
 * the dashboard theme (--bg, --brand-primary, etc.).
 *
 * Cleans up on unmount so dashboard pages are unaffected.
 */
export function useRuntimeStyle(style: ResolvedStyle | null | undefined): void {
    useEffect(() => {
        const rawConfig = style?.config ?? null;
        const tokens = parseTokens(rawConfig);
        const vars = buildVarMap(tokens);

        applyVars(vars);

        return () => {
            clearVars();
        };
    }, [style]);
}

// Re-export default tokens for use in SCSS fallbacks documentation
export { DEFAULT_STYLE_TOKENS };
