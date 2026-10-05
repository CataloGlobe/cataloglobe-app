import React from "react";
import { renderToString } from "react-dom/server";
import LandingPage from "@pages/CampaignLanding/LandingPage";
import { buildLandingDocument } from "@pages/CampaignLanding/prerender";

export { inlineStylesheets } from "@pages/CampaignLanding/prerender";
import type { Variante } from "@pages/CampaignLanding/variant";

/**
 * Entry server della landing di campagna: la usa solo il build
 * (scripts/prerender-landing.mjs) per scrivere `dist/index.html` (/) e
 * `dist/b.html` (/b). Lo stesso albero di `entry-landing.tsx`, che idrata.
 * La pagina non dipende da dati: l'HTML è uguale per tutti.
 */
export function renderLanding(template: string, variante: Variante): string {
    const html = renderToString(
        <React.StrictMode>
            <LandingPage variante={variante} />
        </React.StrictMode>
    );
    return buildLandingDocument(template, html, variante);
}
