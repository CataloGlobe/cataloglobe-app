import { Navigate, useParams } from "react-router-dom";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import { SCOPE_ALL, useSedeScope } from "@/hooks/useSedeScope";

/**
 * Le comande sono di una sede, non dell'azienda (§46.1): il vecchio
 * `/orders` porta dentro il contesto invece di aprire una pagina che poi
 * chiede «di quale sede?».
 *
 * Dove: l'ultima sede usata — la stessa che il selettore single-site già
 * ricorda fra le sessioni — o l'unica che c'è. Se non si può decidere, la
 * scelta la fa l'utente in Sedi, che è la porta del contesto.
 */
export default function OrdersRedirect() {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { value, readableActivities } = useSedeScope({ routeKey: "orders" });

    if (readableActivities.length === 0) {
        // Ancora niente elenco: può essere il caricamento, o nessuna sede
        // leggibile. Un attimo di attesa e poi la decisione qui sotto.
        return value && value !== SCOPE_ALL ? (
            <Navigate to={`/business/${businessId}/locations/${value}/comande`} replace />
        ) : (
            <AppLoader />
        );
    }

    const target = value && value !== SCOPE_ALL && readableActivities.some(a => a.id === value) ? value : null;

    return (
        <Navigate
            to={target ? `/business/${businessId}/locations/${target}/comande` : `/business/${businessId}/locations`}
            replace
        />
    );
}
