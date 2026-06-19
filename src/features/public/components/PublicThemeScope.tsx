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
 */
export default function PublicThemeScope({ tokens: tokensProp, style, className, children }: Props) {
    const tokens = tokensProp ?? parseTokens(style?.config ?? null);
    const cssVars = mapStyleTokensToCssVars(tokens);
    // Callback ref: il set triggera un re-render quando il nodo monta → il
    // context si aggiorna e PublicSheet riceve il target del portal.
    const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

    return (
        <div className={className} style={cssVars as React.CSSProperties}>
            <PublicPortalContext.Provider value={portalNode}>
                {children}
                {/* Portal-root: plain div, nessuno stile → nessuno stacking
                    context. Ultimo figlio del theme scope. */}
                <div ref={setPortalNode} />
            </PublicPortalContext.Provider>
        </div>
    );
}
