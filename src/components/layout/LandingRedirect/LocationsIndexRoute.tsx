import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import { useSedeScope } from "@/hooks/useSedeScope";

/**
 * `/locations`: con una sede leggibile non c'è una pagina Sedi (§51.3), si
 * va alla Scheda della sede; altrimenti l'elenco (`children`). Eliminare la
 * sede resta in Scheda › Pubblicazione.
 */
export default function LocationsIndexRoute({ children }: { children: ReactNode }) {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { readableActivities, isLoaded } = useSedeScope();

    if (!isLoaded) return <AppLoader />;
    if (readableActivities.length === 1) {
        return <Navigate to={`/business/${businessId}/locations/${readableActivities[0].id}/anagrafica`} replace />;
    }
    return <>{children}</>;
}
