import { useEffect } from "react";
import type { Variante } from "@pages/CampaignLanding/variant";

/** La pagina di riferimento per i motori: la variante form su `/`. */
const CANONICAL = "https://cataloglobe.com/";

/**
 * Head della variante signup (`/b`): canonical su `/` e `noindex`, perché è
 * la stessa pagina con un'altra CTA (A/B test). In produzione li porta già
 * `dist/b.html` (scripts/prerender-landing.mjs): qui non si duplica niente,
 * si aggiunge solo ciò che manca (dev, dove `/b` è una route dell'app) e
 * all'uscita si toglie solo ciò che si è aggiunto.
 */
export function useVariantHead(variante: Variante) {
    useEffect(() => {
        if (variante !== "signup") return;

        const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
        const previousCanonical = canonical?.getAttribute("href") ?? null;
        canonical?.setAttribute("href", CANONICAL);

        let added: HTMLMetaElement | null = null;
        if (!document.head.querySelector('meta[name="robots"]')) {
            added = document.createElement("meta");
            added.name = "robots";
            added.content = "noindex";
            document.head.appendChild(added);
        }

        return () => {
            if (canonical && previousCanonical !== null) canonical.setAttribute("href", previousCanonical);
            added?.remove();
        };
    }, [variante]);
}
