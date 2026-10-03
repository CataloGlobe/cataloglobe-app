import { Navigate, useParams } from "react-router-dom";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import { useSedeScope } from "@/hooks/useSedeScope";
import { businessHomePath } from "@/utils/navLanding";

/**
 * `/business/:businessId` senza pagina: l'ingresso nell'azienda (D1 §1). Con
 * una sola sede leggibile si entra nella sede; altrimenti la Panoramica.
 * Workspace, cambio azienda, logo e inviti puntano qui, non a `/overview`:
 * la scelta si fa una volta sola.
 */
export default function BusinessHomeRedirect() {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { readableActivities, isLoaded } = useSedeScope();

    if (!isLoaded) return <AppLoader />;

    return <Navigate to={businessHomePath(businessId, readableActivities.map(a => a.id))} replace />;
}
