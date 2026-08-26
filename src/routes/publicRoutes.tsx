import { Suspense, lazy } from "react";
import { Route } from "react-router-dom";

import PublicErrorBoundary from "@components/PublicErrorBoundary/PublicErrorBoundary";
import { AppLoader } from "@components/ui/AppLoader/AppLoader";
import PublicCollectionPage, {
    type PublicCatalogInitialPayload
} from "@pages/PublicCollectionPage/PublicCollectionPage";

/**
 * Dichiarazione UNICA delle route pubbliche slug-based.
 *
 * Perché esiste: queste route vivevano in due elenchi separati — `App.tsx`
 * (SPA) e `entry-client.tsx` (bundle di hydration della shell SSR). Chi apre
 * il link di un menu, tipicamente scansionando un QR, esegue il SECONDO. Una
 * route dichiarata solo nel primo è quindi invisibile proprio sul percorso a
 * traffico più alto: è successo in produzione con `/:slug/prenota`, che cadeva
 * sul catch-all `/:slug/:lang?` con lang="prenota" → redirect indietro e
 * refetch del catalogo, invece della pagina prenotazione. Nessun errore in
 * console, solo un pulsante che "non fa niente".
 *
 * REGOLA: ogni nuova route pubblica va aggiunta QUI, mai direttamente in uno
 * dei due entry. Il modulo tiene insieme path E wrapping (error boundary,
 * Suspense, lazy), così i due entry non possono divergere né su quali route
 * esistono né su come sono avvolte.
 *
 * Il catch-all `*` NON sta qui di proposito: non è una route pubblica ma il
 * fallback terminale dell'intero set di route di ciascun entry, e in `App.tsx`
 * deve venire dopo anche le route non-slug (`/`, `/legal/*`, `/status`, ...)
 * che questo modulo non conosce. Resta dichiarato in entrambi gli entry.
 */

// Lazy: la prenotazione è dietro interazione utente e non deve entrare nel
// bundle di hydration del catalogo (critico per LCP — lo paga ogni scansione).
const ReservationPage = lazy(() => import("@pages/ReservationPage/ReservationPage"));

type PublicRoutesOptions = {
    /**
     * Payload inlinato dalla shell SSR, passato solo da `entry-client.tsx`.
     * Assente nella SPA: la pagina fetcha come sempre.
     */
    initialPayload?: PublicCatalogInitialPayload;
};

/**
 * Ritorna un ARRAY di elementi `<Route>`, non un componente: `<Routes>`
 * ispeziona i propri children cercando elementi `<Route>` e non attraversa un
 * componente intermedio — che renderebbe le route invisibili al matcher. Un
 * array interpolato come figlio viene invece attraversato correttamente.
 */
export function publicRoutes({ initialPayload }: PublicRoutesOptions = {}) {
    const reservationElement = (
        <PublicErrorBoundary>
            <Suspense fallback={<AppLoader intent="public" />}>
                <ReservationPage />
            </Suspense>
        </PublicErrorBoundary>
    );

    return [
        // Più specifiche del catch-all catalogo grazie al segmento literal.
        <Route key="/:slug/prenota" path="/:slug/prenota" element={reservationElement} />,
        <Route key="/:slug/:lang/prenota" path="/:slug/:lang/prenota" element={reservationElement} />,
        <Route
            key="/:slug/:lang?"
            path="/:slug/:lang?"
            element={
                <PublicErrorBoundary>
                    <PublicCollectionPage initialPayload={initialPayload} />
                </PublicErrorBoundary>
            }
        />
    ];
}
