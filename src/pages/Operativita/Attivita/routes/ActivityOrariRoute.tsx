import { useCallback, useEffect, useState } from "react";
import { ActivityHoursSection } from "../tabs/hours-services/ActivityHoursSection";
import { ActivityHoursDrawer } from "../tabs/hours-services/ActivityHoursDrawer";
import { ActivityClosuresSection } from "../tabs/hours-services/ActivityClosuresSection";
import { ActivityClosureCreateEditDrawer } from "../tabs/hours-services/ActivityClosureCreateEditDrawer";
import { ActivityClosureDeleteDialog } from "../tabs/hours-services/ActivityClosureDeleteDialog";
import { ActivityBlockTimeRangeDrawer } from "../tabs/hours-services/ActivityBlockTimeRangeDrawer";
import { useActivityDetail } from "../ActivityDetailContext";
import { listActivityClosures } from "@/services/supabase/activityClosures";
import { updateActivityHoursPublic } from "@/services/supabase/activities";
import { useToast } from "@/context/Toast/ToastContext";
import type { V2ActivityClosure } from "@/types/activity-closures";
import styles from "./ActivityOrariRoute.module.scss";

/**
 * Orari (§31.1): settimana e chiusure straordinarie. Gli orari arrivano dal
 * parent (li legge anche Canali); le chiusure vivono solo qui. L'editor
 * degli orari è un drawer lg (registro Sedi, chiusura 6).
 */
export default function ActivityOrariRoute() {
    const { activity, tenantId, reload, hours, isHoursLoading, loadHours, canManageHours } = useActivityDetail();
    const { showToast } = useToast();

    const [isHoursDrawerOpen, setIsHoursDrawerOpen] = useState(false);
    const [isHoursPublicSaving, setIsHoursPublicSaving] = useState(false);

    const [closures, setClosures] = useState<V2ActivityClosure[]>([]);
    const [isClosuresLoading, setIsClosuresLoading] = useState(true);
    const [isClosureDrawerOpen, setIsClosureDrawerOpen] = useState(false);
    const [isClosureDeleteOpen, setIsClosureDeleteOpen] = useState(false);
    const [isBlockRangeOpen, setIsBlockRangeOpen] = useState(false);
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
        void loadClosures();
    }, [loadClosures]);

    // Il drawer scrive anche `hours_public` sulla riga sede: ricarica entrambi.
    const handleHoursSaved = useCallback(async () => {
        await Promise.all([loadHours(), reload()]);
    }, [loadHours, reload]);

    const handleHoursPublicChange = useCallback(
        async (next: boolean) => {
            setIsHoursPublicSaving(true);
            try {
                await updateActivityHoursPublic(activity.id, tenantId, next);
                await reload();
                showToast({ message: next ? "Orari visibili sulla pagina pubblica." : "Orari nascosti dalla pagina pubblica.", type: "success" });
            } catch {
                showToast({ message: "Impossibile aggiornare la visibilità degli orari.", type: "error" });
            } finally {
                setIsHoursPublicSaving(false);
            }
        },
        [activity.id, tenantId, reload, showToast]
    );

    return (
        <div className={styles.page}>
            <ActivityHoursSection
                hours={hours}
                isLoading={isHoursLoading}
                hoursPublic={activity.hours_public}
                onHoursPublicChange={canManageHours ? next => void handleHoursPublicChange(next) : undefined}
                isHoursPublicSaving={isHoursPublicSaving}
                onEditRequest={canManageHours ? () => setIsHoursDrawerOpen(true) : undefined}
            />
            <ActivityClosuresSection
                closures={closures}
                isLoading={isClosuresLoading}
                onCreateRequest={
                    canManageHours
                        ? () => {
                              setClosureMode("create");
                              setSelectedClosure(undefined);
                              setIsClosureDrawerOpen(true);
                          }
                        : undefined
                }
                onBlockRequest={canManageHours ? () => setIsBlockRangeOpen(true) : undefined}
                onEditRequest={
                    canManageHours
                        ? closure => {
                              setClosureMode("edit");
                              setSelectedClosure(closure);
                              setIsClosureDrawerOpen(true);
                          }
                        : undefined
                }
                onDeleteRequest={
                    canManageHours
                        ? closure => {
                              setSelectedClosure(closure);
                              setIsClosureDeleteOpen(true);
                          }
                        : undefined
                }
            />

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
                onSuccess={loadClosures}
            />
            <ActivityBlockTimeRangeDrawer
                open={isBlockRangeOpen}
                onClose={() => setIsBlockRangeOpen(false)}
                activityId={activity.id}
                tenantId={tenantId}
                hours={hours}
                closures={closures}
                onSuccess={loadClosures}
            />
            <ActivityClosureDeleteDialog
                open={isClosureDeleteOpen}
                onClose={() => setIsClosureDeleteOpen(false)}
                closure={selectedClosure}
                tenantId={tenantId}
                onSuccess={loadClosures}
            />
        </div>
    );
}
