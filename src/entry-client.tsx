import { Suspense, lazy } from "react";
import { hydrateRoot } from "react-dom/client";
import { Route, Routes } from "react-router-dom";

import "@styles/global.scss";
import "@/i18n";

import PublicProviders from "@/components/public/PublicProviders";
import PublicErrorBoundary from "@/components/PublicErrorBoundary/PublicErrorBoundary";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import PublicCollectionPage from "@/pages/PublicCollectionPage/PublicCollectionPage";
import type { Allergen } from "@/services/supabase/allergens";
import type { ResolvedPayloadShape } from "@/types/publicCatalog";

// Lazy: la prenotazione è dietro interazione utente, non deve entrare nel
// bundle di hydration del catalogo (critico per LCP).
const ReservationPage = lazy(() => import("@/pages/ReservationPage/ReservationPage"));

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
                {/* Le route raggiungibili via `navigate()` DALLA pagina pubblica
                    devono esistere anche qui, non solo in App.tsx: su una pagina
                    servita dalla shell SSR gira questo bundle, non la SPA. Se
                    manca, `/:slug/prenota` cade sul catch-all `/:slug/:lang?`
                    con lang="prenota" → redirect a `/:slug` e refetch (toast
                    "Traduzione..."), invece della pagina prenotazione. */}
                <Route
                    path="/:slug/prenota"
                    element={
                        <PublicErrorBoundary>
                            <Suspense fallback={<AppLoader intent="public" />}>
                                <ReservationPage />
                            </Suspense>
                        </PublicErrorBoundary>
                    }
                />
                <Route
                    path="/:slug/:lang/prenota"
                    element={
                        <PublicErrorBoundary>
                            <Suspense fallback={<AppLoader intent="public" />}>
                                <ReservationPage />
                            </Suspense>
                        </PublicErrorBoundary>
                    }
                />
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
