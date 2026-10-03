// Prima di tutto il CSS globale: prima dell'entry separata stava nel foglio
// principale e quello della landing arrivava dopo, col chunk lazy. Lo stesso
// ordine tiene uguale la cascata a parità di specificità.
import "@styles/global.scss";
import React from "react";
import ReactDOM from "react-dom/client";
import LandingPage from "@pages/CampaignLanding/LandingPage";
import { authRedirectTarget } from "@pages/CampaignLanding/authRedirect";
import { capturePromoFromUrl } from "@/utils/promoCode";

// Entry della landing di campagna (/ e /b), separata da main.tsx: niente
// router, auth, notifiche, i18n né client Supabase nel caricamento iniziale.
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

    // Inter serve solo al titolo del banner cookie (font dei titoli globali):
    // il foglio si aggancia qui, così non blocca il primo render.
    const inter = document.createElement("link");
    inter.rel = "stylesheet";
    inter.href = "/fonts/app-inter.css";
    document.head.appendChild(inter);

    const variante = window.location.pathname.replace(/\/+$/, "") === "/b" ? "signup" : "form";

    ReactDOM.createRoot(document.getElementById("root")!).render(
        <React.StrictMode>
            <LandingPage variante={variante} />
        </React.StrictMode>
    );
}
