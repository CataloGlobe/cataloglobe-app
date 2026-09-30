import { useEffect } from "react";
import type { Variante } from "@pages/CampaignLanding/variant";

/** La pagina di riferimento per i motori: la variante form su `/`. */
const CANONICAL = "https://cataloglobe.com/";

/**
 * Head della variante signup (`/b`): canonical su `/` e `noindex`, perché è
 * la stessa pagina con un'altra CTA (A/B test). Solo a runtime: `/b` è servita
 * da `index.html` come `/`. All'uscita dalla pagina si rimette com'era.
 */
export function useVariantHead(variante: Variante) {
    useEffect(() => {
        if (variante !== "signup") return;

        const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
        const previousCanonical = canonical?.getAttribute("href") ?? null;
        canonical?.setAttribute("href", CANONICAL);

        const robots = document.createElement("meta");
        robots.name = "robots";
        robots.content = "noindex";
        document.head.appendChild(robots);

        return () => {
            if (canonical && previousCanonical !== null) canonical.setAttribute("href", previousCanonical);
            robots.remove();
        };
    }, [variante]);
}
