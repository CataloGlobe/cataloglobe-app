import { hydrateRoot } from "react-dom/client";
import { Route, Routes } from "react-router-dom";

import "@styles/global.scss";
import "@/i18n";

import PublicProviders from "@/components/public/PublicProviders";
import PublicCollectionPage from "@/pages/PublicCollectionPage/PublicCollectionPage";
import type { Allergen } from "@/services/supabase/allergens";
import type { ResolvedPayloadShape } from "@/types/publicCatalog";

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
 */

declare global {
    interface Window {
        /** Dati inlinati dalla shell SSR (4b: payload + allergeni già
            fetchati server-side). Assente su SPA classica. */
        __PUBLIC_CATALOG__?: {
            payload: ResolvedPayloadShape;
            allergens: Allergen[] | null;
        };
    }
}

const container = document.getElementById("root");
const initialPayload = window.__PUBLIC_CATALOG__;

if (container) {
    hydrateRoot(
        container,
        <PublicProviders router="browser">
            <Routes>
                <Route path="/:slug/:lang?" element={<PublicCollectionPage initialPayload={initialPayload} />} />
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
