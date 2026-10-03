import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import { useTenant } from "@/context/useTenant";
import { usePermissions } from "@/context/usePermissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { firstSedeSegment, legacyTabTarget } from "@/utils/navLanding";

/**
 * `/locations/:activityId` senza pagina: si atterra sulla prima voce della
 * sidebar di sede che chi guarda può usare (§46.1 f), saltando quelle col
 * lucchetto del piano. I vecchi `?tab=` della scheda vincono: un link vecchio
 * porta ancora alla sua sezione.
 */
export default function SedeHomeRedirect() {
    const { businessId = "", activityId = "" } = useParams<{ businessId: string; activityId: string }>();
    const [searchParams] = useSearchParams();
    const { permissions } = usePermissions();
    const { selectedTenant } = useTenant();
    const { hasFeature } = usePlanFeatures();
    const base = `/business/${businessId}/locations/${activityId}`;

    const legacyTab = searchParams.get("tab");
    if (legacyTab) {
        const target = legacyTabTarget(legacyTab);
        return (
            <Navigate
                to={{
                    pathname: `${base}/${target.segment}`,
                    search: target.search ? `?${target.search}` : "",
                    hash: target.hash ? `#${target.hash}` : ""
                }}
                replace
            />
        );
    }

    // Permessi e piano devono esserci: con quelli ottimistici del caricamento
    // si atterrerebbe su una voce che poi sparisce o prende il lucchetto.
    if (!permissions || !selectedTenant) return <AppLoader />;

    return <Navigate to={`${base}/${firstSedeSegment(permissions, hasFeature, activityId)}`} replace />;
}
