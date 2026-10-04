import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import { useTenant } from "@/context/useTenant";
import { usePermissions } from "@/context/usePermissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { legacyTabTarget } from "@/utils/navLanding";
import { sedeLandingSegment } from "@/utils/navModel";

/**
 * `/locations/:activityId` senza pagina: l'ingresso nella sede (§51.6). Chi
 * la gestisce parte dalla Scheda; staff e viewer dalla prima voce di
 * Operatività che possono usare, saltando quelle col lucchetto del piano.
 * I vecchi `?tab=` della scheda vincono: un link vecchio porta ancora alla
 * sua sezione.
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

    return <Navigate to={`${base}/${sedeLandingSegment(permissions, hasFeature, activityId)}`} replace />;
}
