import { useEffect } from "react";
import {
    parseTokens,
    DEFAULT_STYLE_TOKENS,
    type StyleTokenModel
} from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import type { ResolvedStyle } from "@/services/supabase/v2/resolveActivityCatalogsV2";

// ─────────────────────────────────────────────────────────────────────────────
// CSS variable namespace consumed by all public components.
// These are deliberately separate from the dashboard theme vars.
// ─────────────────────────────────────────────────────────────────────────────
const RUNTIME_VAR_KEYS = [
    "--pub-bg",
    "--pub-primary",
    "--pub-header-bg",
    "--pub-header-radius",
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
        // card vars — derived from header radius for consistency (no separate token yet)
        "--pub-card-bg": "#ffffff",
        "--pub-card-radius": `${Math.round(tokens.header.imageBorderRadiusPx * 0.75)}px`,
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
