import React from "react";
import {
    parseTokens,
    type StyleTokenModel
} from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import type { ResolvedStyle } from "@/services/supabase/resolveActivityCatalogs";
import { mapStyleTokensToCssVars } from "@/features/public/utils/mapStyleTokensToCssVars";

type Props = {
    /** Pre-parsed tokens. Takes precedence over `style` when provided. */
    tokens?: StyleTokenModel;
    /** Raw ResolvedStyle from the DB. Parsed internally when `tokens` is not provided. */
    style?: ResolvedStyle | null;
    children: React.ReactNode;
};

/**
 * Applies --pub-* CSS variables as inline style on a scoped wrapper div.
 * Accepts either pre-parsed `tokens` (style preview) or a raw `style` record (public page).
 *
 * Variables are inherited by all descendant components so var(--pub-*)
 * references continue to resolve correctly without touching :root.
 */
export default function PublicThemeScope({ tokens: tokensProp, style, children }: Props) {
    const tokens = tokensProp ?? parseTokens(style?.config ?? null);
    const cssVars = mapStyleTokensToCssVars(tokens);

    return (
        <div style={cssVars as React.CSSProperties}>
            {children}
        </div>
    );
}
