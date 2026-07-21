import React, { useState } from "react";
import {
    parseTokens,
    type StyleTokenModel
} from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import type { ResolvedStyle } from "@/types/resolvedCollections";
import { mapStyleTokensToCssVars } from "@/features/public/utils/mapStyleTokensToCssVars";
import { PublicPortalContext } from "@/features/public/components/PublicPortalContext";

type Props = {
    /** Pre-parsed tokens. Takes precedence over `style` when provided. */
    tokens?: StyleTokenModel;
    /** Raw ResolvedStyle from the DB. Parsed internally when `tokens` is not provided. */
    style?: ResolvedStyle | null;
    className?: string;
    children: React.ReactNode;
};

/**
 * Applies --pub-* CSS variables as inline style on a scoped wrapper div.
 * Accepts either pre-parsed `tokens` (style preview) or a raw `style` record (public page).
 *
 * Variables are inherited by all descendant components so var(--pub-*)
 * references continue to resolve correctly without touching :root.
 *
 * `font-family` is ALSO set directly (not just the --pub-font-family var):
 * `body { font-family: $font-stack }` in global.scss is a literal declaration
 * (not `inherit`), so it wins over html's `var(--pub-font-family)` for any
 * descendant that doesn't restate the var itself — plain buttons/spans with
 * `font-family: inherit` (or no rule at all) silently fell through to the
 * hardcoded Inter stack instead of the active theme. Setting it here, once,
 * closes the gap for the whole public subtree without touching global.scss
 * (which must stay as-is for the admin dashboard, whose `html` var falls back
 * to "Outfit" — this scope never wraps admin routes).
 */
export default function PublicThemeScope({ tokens: tokensProp, style, className, children }: Props) {
    const tokens = tokensProp ?? parseTokens(style?.config ?? null);
    const cssVars = mapStyleTokensToCssVars(tokens);
    // Callback ref: il set triggera un re-render quando il nodo monta → il
    // context si aggiorna e PublicSheet riceve il target del portal.
    const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

    return (
        <div
            className={className}
            style={{ ...cssVars, fontFamily: cssVars["--pub-font-family"] } as React.CSSProperties}
            data-card-treatment={tokens.appearance.cardTreatment}
            data-font-family={tokens.typography.fontFamily}
        >
            <PublicPortalContext.Provider value={portalNode}>
                {children}
                {/* Portal-root: plain div, nessuno stile → nessuno stacking
                    context. Ultimo figlio del theme scope. */}
                <div ref={setPortalNode} />
            </PublicPortalContext.Provider>
        </div>
    );
}
