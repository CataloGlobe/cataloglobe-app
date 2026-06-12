import type { ReactNode } from "react";
import { BrowserRouter, StaticRouter } from "react-router-dom";

/**
 * Stack provider per la route pubblica /:slug (SSR stage 4a).
 *
 * Set minimo determinato per grep dei consumer (stadio 4a, step 0): l'albero
 * pubblico (PublicCollectionPage + PublicCatalogReady + PublicCollectionView/*
 * + NotFound/AppLoader/StaleDataBanner/PublicErrorBoundary) NON consuma
 * nessuno dei provider globali di main.tsx:
 *   - ToastProvider: il toast lingua della pagina è stato locale inline,
 *     nessun useToast nel sottoalbero;
 *   - ThemeProvider: setta data-theme per l'admin; il pubblico usa
 *     PublicThemeScope (--pub-*) + token :root light con fallback hardcoded;
 *   - TooltipProvider / AuthProvider / NotificationsProvider: consumer solo
 *     admin/workspace (il check auth del ramo ?simulate usa supabase.auth
 *     direttamente, non AuthProvider).
 * → resta SOLO il router. Se in futuro un componente pubblico adotta un
 * provider globale, va aggiunto qui (server E client insieme).
 *
 * Parametrizzato sul router: "static" per il render server (StaticRouter,
 * declarative mode React Router v7), "browser" per l'hydration client.
 * Niente StrictMode qui: lo decide l'entry (per SSR/hydration resta fuori).
 */

export type PublicProvidersProps = {
    router: "static" | "browser";
    /** URL corrente per StaticRouter (es. "/san-pietro"). Ignorata su browser. */
    location?: string;
    children: ReactNode;
};

export default function PublicProviders({ router, location, children }: PublicProvidersProps) {
    if (router === "static") {
        return <StaticRouter location={location ?? "/"}>{children}</StaticRouter>;
    }
    return <BrowserRouter>{children}</BrowserRouter>;
}
