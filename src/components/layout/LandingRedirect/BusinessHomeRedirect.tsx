import { Navigate, useParams } from "react-router-dom";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import { usePermissions } from "@/context/usePermissions";
import { useTenant } from "@/context/useTenant";
import { usePlanFeatures } from "@/lib/planFeatures";
import { useSedeScope } from "@/hooks/useSedeScope";
import { businessHomePath } from "@/utils/navModel";

/**
 * `/business/:businessId` senza pagina: l'ingresso nell'azienda (§51.6). Chi
 * configura apre la Panoramica; staff e viewer con una sede la loro prima
 * voce di Operatività, con più sedi Sedi per scegliere il locale.
 * Workspace, cambio azienda, logo e inviti puntano qui, non a `/overview`:
 * la scelta si fa una volta sola.
 */
export default function BusinessHomeRedirect() {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { readableActivities, isLoaded } = useSedeScope();
    const { permissions } = usePermissions();
    const { selectedTenant } = useTenant();
    const { hasFeature } = usePlanFeatures();

    // Sedi, permessi e piano devono esserci: con quelli ottimistici del
    // caricamento si atterrerebbe su una voce che poi prende il lucchetto.
    if (!isLoaded || !permissions || !selectedTenant) return <AppLoader />;

    return (
        <Navigate
            to={businessHomePath(
                businessId,
                permissions,
                hasFeature,
                readableActivities.map(a => a.id)
            )}
            replace
        />
    );
}
