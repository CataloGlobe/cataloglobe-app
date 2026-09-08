import React, { useCallback, useEffect, useState } from "react";
import { ActivityHoursSection } from "./hours-services/ActivityHoursSection";
import { ActivityHoursDrawer } from "./hours-services/ActivityHoursDrawer";
import { ActivityClosuresSection } from "./hours-services/ActivityClosuresSection";
import { ActivityClosureCreateEditDrawer } from "./hours-services/ActivityClosureCreateEditDrawer";
import { ActivityClosureDeleteDrawer } from "./hours-services/ActivityClosureDeleteDrawer";
import { listActivityClosures } from "@/services/supabase/activityClosures";
import { useToast } from "@/context/Toast/ToastContext";
import type { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import type { V2ActivityClosure } from "@/types/activity-closures";
// Card e layout condivisi con le altre tab della sede (vedi ActivityOrderingTab).
import cardStyles from "./ActivitySettingsTab.module.scss";

interface ActivityHoursTabProps {
    activity: V2Activity;
    tenantId: string;
    /** Orari caricati dalla pagina: sono un dato della sede, non della tab
     *  (li legge anche Prenotazioni per la nota "mancano gli orari"). */
    hours: V2ActivityHours[];
    isHoursLoading: boolean;
    /** Ricarica gli orari a livello pagina dopo una scrittura dal drawer. */
    onHoursChanged: () => Promise<void>;
    onReload: () => Promise<void>;
    /** `activity_hours.write` sulla sede. */
    canManageHours?: boolean;
}

/**
 * Tab "Orari": orari di apertura + chiusure straordinarie.
 * Gli orari arrivano dalla pagina; le chiusure vivono solo qui.
 */
export const ActivityHoursTab: React.FC<ActivityHoursTabProps> = ({
    activity,
    tenantId,
    hours,
    isHoursLoading,
    onHoursChanged,
    onReload,
    canManageHours = true
}) => {
    const { showToast } = useToast();

    const [isHoursDrawerOpen, setIsHoursDrawerOpen] = useState(false);

    const [closures, setClosures] = useState<V2ActivityClosure[]>([]);
    const [isClosuresLoading, setIsClosuresLoading] = useState(true);
    const [isClosureDrawerOpen, setIsClosureDrawerOpen] = useState(false);
    const [isClosureDeleteDrawerOpen, setIsClosureDeleteDrawerOpen] = useState(false);
    const [closureMode, setClosureMode] = useState<"create" | "edit">("create");
    const [selectedClosure, setSelectedClosure] = useState<V2ActivityClosure | undefined>();

    const loadClosures = useCallback(async () => {
        try {
            setIsClosuresLoading(true);
            setClosures(await listActivityClosures(activity.id, tenantId));
        } catch {
            showToast({ message: "Errore nel caricamento delle chiusure.", type: "error" });
        } finally {
            setIsClosuresLoading(false);
        }
    }, [activity.id, tenantId, showToast]);

    useEffect(() => {
        loadClosures();
    }, [loadClosures]);

    // Il drawer orari scrive anche sulla riga sede (es. `hours_public`):
    // ricarica entrambi.
    const handleHoursSaved = useCallback(async () => {
        await Promise.all([onHoursChanged(), onReload()]);
    }, [onHoursChanged, onReload]);

    const handleClosureSaved = useCallback(async () => {
        await loadClosures();
    }, [loadClosures]);

    const openCreateClosure = () => {
        setClosureMode("create");
        setSelectedClosure(undefined);
        setIsClosureDrawerOpen(true);
    };

    const openEditClosure = (closure: V2ActivityClosure) => {
        setClosureMode("edit");
        setSelectedClosure(closure);
        setIsClosureDrawerOpen(true);
    };

    const openDeleteClosure = (closure: V2ActivityClosure) => {
        setSelectedClosure(closure);
        setIsClosureDeleteDrawerOpen(true);
    };

    return (
        <>
            <div className={cardStyles.layout}>
                <div className={cardStyles.row}>
                    {isHoursLoading ? (
                        <div className={cardStyles.skeletonCard} />
                    ) : (
                        <ActivityHoursSection
                            hours={hours}
                            activity={activity}
                            onEditRequest={canManageHours ? () => setIsHoursDrawerOpen(true) : undefined}
                        />
                    )}
                    {isClosuresLoading ? (
                        <div className={cardStyles.skeletonCard} />
                    ) : (
                        <ActivityClosuresSection
                            closures={closures}
                            onCreateRequest={canManageHours ? openCreateClosure : undefined}
                            onEditRequest={canManageHours ? openEditClosure : undefined}
                            onDeleteRequest={canManageHours ? openDeleteClosure : undefined}
                        />
                    )}
                </div>
            </div>

            <ActivityHoursDrawer
                open={isHoursDrawerOpen}
                onClose={() => setIsHoursDrawerOpen(false)}
                hours={hours}
                activity={activity}
                tenantId={tenantId}
                onSuccess={handleHoursSaved}
            />
            <ActivityClosureCreateEditDrawer
                open={isClosureDrawerOpen}
                onClose={() => setIsClosureDrawerOpen(false)}
                mode={closureMode}
                activityId={activity.id}
                tenantId={tenantId}
                selectedClosure={selectedClosure}
                onSuccess={handleClosureSaved}
            />
            <ActivityClosureDeleteDrawer
                open={isClosureDeleteDrawerOpen}
                onClose={() => setIsClosureDeleteDrawerOpen(false)}
                closure={selectedClosure}
                tenantId={tenantId}
                onSuccess={handleClosureSaved}
            />
        </>
    );
};
