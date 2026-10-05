// Prima di tutto il CSS globale: prima dell'entry separata stava nel foglio
// principale e quello della landing arrivava dopo, col chunk lazy. Lo stesso
// ordine tiene uguale la cascata a parità di specificità.
import "@styles/global.scss";
import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import LandingPage from "@pages/CampaignLanding/LandingPage";
import { authRedirectTarget } from "@pages/CampaignLanding/authRedirect";
import { prerenderedVariante } from "@pages/CampaignLanding/prerender";
import { capturePromoFromUrl } from "@/utils/promoCode";

// Entry della landing di campagna (/ e /b), separata da main.tsx: niente
// router, auth, notifiche, i18n né client Supabase nel caricamento iniziale.
// L'HTML arriva già renderizzato (entry-landing-server.tsx al build): qui si
// idrata, con la variante scritta sul #root dal prerender.
// Degli effetti globali di App restano i due che toccano la landing:
// - un link email di Supabase atterrato su / va nell'app (authRedirect.ts);
// - il codice promo in query (PromoCaptureRoot) si salva all'arrivo.
// ScrollToTop non serve: senza router ogni pagina è un caricamento nuovo.
// Il tema della dashboard (data-theme) non si applica: la landing è chiara per tutti.

const redirect = authRedirectTarget(window.location.search, window.location.hash);

if (redirect) {
    window.location.replace(redirect);
} else {
    capturePromoFromUrl(new URLSearchParams(window.location.search));

    const root = document.getElementById("root")!;
    const prerendered = prerenderedVariante(root);
    const variante = prerendered ?? (window.location.pathname.replace(/\/+$/, "") === "/b" ? "signup" : "form");
    const page = (
        <React.StrictMode>
            <LandingPage variante={variante} />
        </React.StrictMode>
    );

    // Senza prerender (landing.html servito dal dev server) si monta da zero.
    if (prerendered) hydrateRoot(root, page);
    else createRoot(root).render(page);
}
