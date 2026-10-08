import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { usePermissions } from "@/context/usePermissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { useSedeScope } from "@/hooks/useSedeScope";
import { useActivitySummary } from "@/hooks/useActivitySummary";
import { useAddActivityGate } from "@/hooks/useAddActivityGate";
import { resolveNavContext, switchSedePath } from "@/utils/navModel";

/** `/business/:businessId/locations/:activityId[/:segment]` — dentro una sede. */
const SEDE_PATH = /^\/business\/[^/]+\/locations\/([^/]+)(?:\/([^/?#]+))?/;

/**
 * Dove sei e come si cambia sede (§51.7), per i due selettori: la testata al
 * telefono (`HeaderSedeSwitcher`) e la cima della sidebar (`PlaceSwitcher`).
 * - Una sede: è quella; nel menù la sede e «Aggiungi una sede».
 * - Più sedi, fuori da una sede: nessuna sede corrente; sceglierne una ci entra.
 * - Più sedi, dentro una sede: scegliere un'altra sede resta sulla stessa
 *   pagina, o atterra come entrando se lì non si può usare.
 * `ready` falso: sedi non arrivate o nessuna sede leggibile.
 */
export function useSedeSwitcher() {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { permissions } = usePermissions();
    const { hasFeature } = usePlanFeatures();
    const { readableActivities, isLoaded } = useSedeScope();
    const { canCreate, tryOpen } = useAddActivityGate();
    const [addOpen, setAddOpen] = useState(false);
    // Il drawer (piano, prezzi, intervallo) si monta al primo «Aggiungi»: non
    // a ogni pagina.
    const [addMounted, setAddMounted] = useState(false);

    const match = SEDE_PATH.exec(pathname);
    const pathActivityId = match?.[1] ?? null;
    const pathSegment = match?.[2] ?? null;
    // Una sede fuori dall'elenco leggibile (link vecchio, sede appena creata
    // altrove): il nome arriva comunque dalla cache.
    const pathSummary = useActivitySummary(pathActivityId ?? undefined);

    const ready = isLoaded && readableActivities.length > 0;
    const context = resolveNavContext(readableActivities.length, pathActivityId !== null);
    const currentId = !ready
        ? null
        : context === "unica"
          ? readableActivities[0].id
          : context === "sede"
            ? pathActivityId
            : null;
    const current = currentId ? readableActivities.find(a => a.id === currentId) ?? null : null;
    const currentName = currentId ? current?.name ?? pathSummary?.name ?? "" : null;
    const suspended = currentId ? (current?.status ?? pathSummary?.status) === "inactive" : false;

    const choose = (id: string) => {
        if (id === currentId) return;
        if (context === "sede" && permissions) {
            navigate(switchSedePath(pathSegment, businessId, id, permissions, hasFeature));
            return;
        }
        // Si entra nella sede: dove si atterra lo decide l'indice della sede.
        navigate(`/business/${businessId}/locations/${id}`);
    };

    const openAdd = () => {
        if (!tryOpen()) return;
        setAddMounted(true);
        setAddOpen(true);
    };

    return {
        ready,
        context,
        activities: readableActivities,
        currentId,
        currentName,
        suspended,
        choose,
        goToAll: () => navigate(`/business/${businessId}/locations`),
        canCreate,
        openAdd,
        addOpen,
        addMounted,
        closeAdd: () => setAddOpen(false)
    };
}
