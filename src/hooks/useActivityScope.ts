import { useParams } from "react-router-dom";
import { SCOPE_ALL, useSedeScope, type UseSedeScopeOpts, type UseSedeScopeResult } from "./useSedeScope";

export interface UseActivityScopeResult extends UseSedeScopeResult {
    /** La sede su cui lavora la pagina; `null` = tutte le sedi. */
    activityId: string | null;
    /** La sede arriva dal path: siamo dentro il contesto di sede. */
    fromRoute: boolean;
}

/**
 * Su quale sede lavora questa pagina (§46.1). **Prima la rotta**: dentro il
 * contesto di sede (`/locations/:activityId/...`) la sede è nel path — una
 * fonte sola, condivisibile per link, niente stato nascosto. Fuori, resta lo
 * store dello scope in navbar, che è la fonte delle pagine d'azienda.
 *
 * Lo `useSedeScope` si chiama comunque: serve l'elenco delle sedi leggibili
 * anche dentro il contesto, e le regole degli hook non ammettono chiamate
 * condizionate. Dentro il contesto il suo valore non si legge e non si
 * scrive: cambiare sede lì significa cambiare indirizzo.
 */
export function useActivityScope(opts?: UseSedeScopeOpts): UseActivityScopeResult {
    const { activityId: routeActivityId } = useParams<{ activityId?: string }>();
    const scope = useSedeScope(opts);

    if (routeActivityId) {
        return { ...scope, activityId: routeActivityId, fromRoute: true };
    }

    return {
        ...scope,
        activityId: scope.value === SCOPE_ALL ? null : scope.value,
        fromRoute: false
    };
}
