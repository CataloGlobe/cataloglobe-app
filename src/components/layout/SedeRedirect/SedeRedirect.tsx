import { Navigate, useLocation, useParams } from "react-router-dom";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import { SCOPE_ALL, useSedeScope } from "@/hooks/useSedeScope";
import type { BusinessRouteKey } from "@/components/layout/AppHeader/navbarBreadcrumbRoutes";

export interface SedeRedirectProps {
    /** La rotta d'azienda che si reindirizza: deve stare in `SEDE_SINGLE_SITE_ROUTES`. */
    routeKey: BusinessRouteKey;
    /** Il segmento della pagina dentro la sede (`comande`, `prenotazioni`). */
    segment: string;
}

/**
 * Una pagina che è di una sede, non dell'azienda, porta dentro il contesto
 * invece di aprirsi e poi chiedere «di quale sede?» (§46.1 per le comande,
 * §48.1 per le prenotazioni).
 *
 * Dove: l'ultima sede usata — quella in cui si è entrati l'ultima volta (§51.9,
 * `rememberLastSede` nel layout) — o l'unica che c'è. Se non si può decidere, la
 * scelta la fa l'utente in Sedi, che è la porta del contesto.
 *
 * Query e ancora passano: `/orders?tab=tavoli` (il «Vai» degli avvisi, i
 * link salvati) arriva alla vista che chiedeva, non alla prima della pagina.
 */
export default function SedeRedirect({ routeKey, segment }: SedeRedirectProps) {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { value, readableActivities, isLoaded } = useSedeScope({ routeKey });
    const { search, hash } = useLocation();

    if (readableActivities.length === 0 && !isLoaded) {
        // Ancora niente elenco. Con una sede ricordata si parte subito; senza,
        // si aspetta l'elenco per decidere.
        return value && value !== SCOPE_ALL ? (
            <Navigate to={{ pathname: `/business/${businessId}/locations/${value}/${segment}`, search, hash }} replace />
        ) : (
            <AppLoader />
        );
    }

    const target = value && value !== SCOPE_ALL && readableActivities.some(a => a.id === value) ? value : null;

    return (
        <Navigate
            to={
                target
                    ? { pathname: `/business/${businessId}/locations/${target}/${segment}`, search, hash }
                    : `/business/${businessId}/locations`
            }
            replace
        />
    );
}
