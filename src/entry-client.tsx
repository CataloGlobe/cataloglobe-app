import { hydrateRoot } from "react-dom/client";
import { Route, Routes } from "react-router-dom";

import "@styles/global.scss";
import i18n from "@/i18n/public";
import { loadPublicLanguage } from "@/i18n/loadLanguage";

import PublicProviders from "@/components/public/PublicProviders";
import NotFound from "@/pages/NotFound/NotFound";
import type { PublicCatalogInitialPayload } from "@/pages/PublicCollectionPage/PublicCollectionPage";
import { publicRoutes } from "@/routes/publicRoutes";

/**
 * Entry client di hydration per la pagina pubblica /:slug.
 *
 * STAGE 4a: SCAFFOLD compilabile, non collegato a nulla — la shell SSR che
 * lo carica e inlinea `window.__PUBLIC_CATALOG__` arriva in 4b, l'hydration
 * live (pagina che parte dal payload inlinato saltando il primo fetch) in 4c.
 *
 * Stesso albero del render server (PublicProviders → route pubblica) ma con
 * BrowserRouter; niente StrictMode (coerenza col markup server, double-effect
 * solo dev non necessario qui).
 *
 * Le route pubbliche NON sono dichiarate qui: vivono in `routes/publicRoutes`,
 * condivise con `App.tsx`. Il commento di testa di quel modulo spiega perché
 * (una route presente solo nella SPA è invisibile su QUESTO percorso, che è
 * quello di chi apre il menu da QR).
 */

declare global {
    interface Window {
        /** Dati inlinati dalla shell SSR (4b: payload + allergeni già
            fetchati server-side). Assente su SPA classica. */
        __PUBLIC_CATALOG__?: PublicCatalogInitialPayload;
    }
}

const container = document.getElementById("root");
const initialPayload = window.__PUBLIC_CATALOG__;

/**
 * Il server rende l'interfaccia nella lingua della pagina e la scrive in
 * `<html lang>`. Se non è l'italiano (l'unica nel JS iniziale) la si carica
 * prima dell'hydration, così il primo render del client coincide col markup;
 * il chunk è già in `modulepreload` nella shell. Se il download fallisce si
 * idrata lo stesso: React ridisegna dove il markup differisce e la pagina
 * riprova la lingua da sola (`changePublicLanguage`).
 */
async function prepareLanguage(): Promise<void> {
    const lng = document.documentElement.lang;
    if (!lng || lng === "it" || i18n.language === lng) return;
    try {
        await loadPublicLanguage(lng);
        await i18n.changeLanguage(lng);
    } catch {
        // resta l'italiano: vedi sopra
    }
}

/** Rete appesa: dopo 3 s si idrata comunque (la pagina resta interattiva). */
function withTimeout(task: Promise<void>, ms: number): Promise<void> {
    return Promise.race([task, new Promise<void>(resolve => setTimeout(resolve, ms))]);
}

function hydrate(root: HTMLElement): void {
    hydrateRoot(
        root,
        <PublicProviders router="browser">
            <Routes>
                {publicRoutes({ initialPayload })}

                {/* Global 404 — senza, un path non matchato renderizza nulla
                    (schermo bianco). NotFound è già nel bundle: lo importa
                    PublicCollectionPage per gli stati inactive/empty. */}
                <Route path="*" element={<NotFound />} />
            </Routes>
        </PublicProviders>,
        {
            onRecoverableError(error, errorInfo) {
                console.error(
                    "[entry-client] hydration recoverable error:",
                    error,
                    errorInfo?.componentStack ?? ""
                );
            }
        }
    );
}

if (container) void withTimeout(prepareLanguage(), 3000).then(() => hydrate(container));
