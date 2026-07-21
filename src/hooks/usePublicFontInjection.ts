import { useEffect } from "react";
import { parseTokens } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { buildSingleFamilyFontUrl } from "@utils/publicFontUrl";
import type { ResolvedStyle } from "@/types/resolvedCollections";

/**
 * Carica runtime la SOLA famiglia font dello stile attivo su una superficie
 * pubblica (`<link id="public-font-fallback">` in `<head>`). Estratto da
 * `PublicCollectionPage.tsx` — ogni route/componente che monta
 * `PublicThemeScope` deve chiamarlo, altrimenti il browser non ha mai
 * l'@font-face reale e ricade sul generic CSS (`serif`/`cursive`/...), che
 * può apparire visivamente molto diverso dal font scelto (bug scoperto su
 * `ReservationPage` con Patrick Hand → fallback `cursive` reso come corsivo).
 *
 * Warm: se `middleware.ts` (rimosso, vedi commit `a1315573`) avesse già
 * iniettato `<link id="mw-font">`, questo hook non farebbe nulla — il marker
 * check resta per compat/futuro ma oggi non scatta mai (nessun warm path).
 *
 * @param style Raw ResolvedStyle dal payload risolto (o null/undefined finché non arriva).
 */
export function usePublicFontInjection(style: ResolvedStyle | null | undefined): void {
    const activeFontToken = style ? parseTokens(style.config ?? null).typography.fontFamily : null;

    useEffect(() => {
        if (!activeFontToken) return;
        if (document.getElementById("mw-font")) return;

        // Cold hit = HTML originale: l'Inter variable blocking di index.html
        // è ancora presente (il de-block Step 3a avviene solo sul warm), la
        // spec statica sarebbe un secondo download inutile (~30KB).
        if (activeFontToken === "inter") return;

        const href = buildSingleFamilyFontUrl(activeFontToken);
        if (!href) return; // token sconosciuto: nessuna injection

        const existing = document.getElementById("public-font-fallback") as HTMLLinkElement | null;
        if (existing) {
            if (existing.href !== href) existing.href = href;
            return;
        }
        const link = document.createElement("link");
        link.id = "public-font-fallback";
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);

        return () => {
            if (document.head.contains(link)) document.head.removeChild(link);
        };
    }, [activeFontToken]);
}
