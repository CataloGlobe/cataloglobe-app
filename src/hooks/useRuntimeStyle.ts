import { useEffect } from "react";
import { parseTokens, DEFAULT_STYLE_TOKENS } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { mapStyleTokensToCssVars } from "@/features/public/utils/mapStyleTokensToCssVars";
import type { ResolvedStyle } from "@/types/resolvedCollections";

/**
 * Injects runtime CSS variables onto :root derived from the active schedule's
 * style payload. Falls back to DEFAULT_STYLE_TOKENS when style is null.
 *
 * Variables are scoped under the `--pub-*` namespace to avoid collisions with
 * the dashboard theme (--bg, --brand-primary, etc.).
 *
 * Delegates to mapStyleTokensToCssVars() so this hook stays in sync with
 * PublicThemeScope automatically when new tokens are added.
 *
 * Cleans up on unmount so dashboard pages are unaffected.
 */
export function useRuntimeStyle(style: ResolvedStyle | null | undefined): void {
    useEffect(() => {
        const rawConfig = style?.config ?? null;
        const tokens = parseTokens(rawConfig);
        const vars = mapStyleTokensToCssVars(tokens);
        const root = document.documentElement;

        for (const [key, value] of Object.entries(vars)) {
            root.style.setProperty(key, value);
        }

        return () => {
            for (const key of Object.keys(vars)) {
                root.style.removeProperty(key);
            }
        };
    }, [style]);
}

// Re-export default tokens for use in SCSS fallbacks documentation
export { DEFAULT_STYLE_TOKENS };
