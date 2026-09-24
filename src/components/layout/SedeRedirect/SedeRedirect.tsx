import { Navigate, useParams } from "react-router-dom";
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
 * Dove: l'ultima sede usata — la stessa che il selettore single-site già
 * ricorda fra le sessioni — o l'unica che c'è. Se non si può decidere, la
 * scelta la fa l'utente in Sedi, che è la porta del contesto.
 */
export default function SedeRedirect({ routeKey, segment }: SedeRedirectProps) {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { value, readableActivities } = useSedeScope({ routeKey });

    if (readableActivities.length === 0) {
        // Ancora niente elenco: può essere il caricamento, o nessuna sede
        // leggibile. Un attimo di attesa e poi la decisione qui sotto.
        return value && value !== SCOPE_ALL ? (
            <Navigate to={`/business/${businessId}/locations/${value}/${segment}`} replace />
        ) : (
            <AppLoader />
        );
    }

    const target = value && value !== SCOPE_ALL && readableActivities.some(a => a.id === value) ? value : null;

    return (
        <Navigate
            to={target ? `/business/${businessId}/locations/${target}/${segment}` : `/business/${businessId}/locations`}
            replace
        />
    );
}
