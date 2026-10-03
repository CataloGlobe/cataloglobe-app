import type { ReactNode } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import { useSedeScope } from "@/hooks/useSedeScope";
import { usePermissions } from "@/context/usePermissions";

export interface SingleSedeRouteProps {
    /** Il segmento della pagina dentro la sede (`anagrafica`, `analitiche`, `recensioni`). */
    segment: string;
    /** La pagina d'azienda, quando le sedi leggibili non sono una. */
    children: ReactNode;
}

/**
 * Una pagina d'azienda che con una sede leggibile non esiste (§51.3, §51.14):
 * `/locations` porta alla Scheda, `/analytics` e `/reviews` alle rotte di
 * sede corrispondenti, con query e ancora. Con più sedi (o nessuna) la
 * pagina d'azienda.
 */
export default function SingleSedeRoute({ segment, children }: SingleSedeRouteProps) {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { search, hash } = useLocation();
    const { readableActivities, isLoaded } = useSedeScope();
    const { permissions, loading: permissionsLoading } = usePermissions();

    // Permessi non arrivati (errore): niente redirect, la pagina d'azienda
    // dice da sé cosa manca invece di un loader senza fine.
    if (!permissionsLoading && !permissions) return <>{children}</>;
    if (!isLoaded) return <AppLoader />;
    if (readableActivities.length === 1) {
        return (
            <Navigate
                to={{
                    pathname: `/business/${businessId}/locations/${readableActivities[0].id}/${segment}`,
                    search,
                    hash
                }}
                replace
            />
        );
    }
    return <>{children}</>;
}
