import React, { useState, useEffect, useCallback } from "react";
import { IconLoader2 } from "@tabler/icons-react";
import { listActivityHours } from "@/services/supabase/activityHours";
import { listActivityClosures } from "@/services/supabase/activityClosures";
import type { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import type { V2ActivityClosure } from "@/types/activity-closures";
import { useToast } from "@/context/Toast/ToastContext";
import { ActivityHoursSection } from "./hours-services/ActivityHoursSection";
import { ActivityHoursDrawer } from "./hours-services/ActivityHoursDrawer";
import { ActivityClosuresSection } from "./hours-services/ActivityClosuresSection";
import { ActivityClosureCreateEditDrawer } from "./hours-services/ActivityClosureCreateEditDrawer";
import { ActivityClosureDeleteDrawer } from "./hours-services/ActivityClosureDeleteDrawer";
import { PaymentMethodsSection } from "./hours-services/PaymentMethodsSection";
import { ServicesSection } from "./hours-services/ServicesSection";
import pageStyles from "../ActivityDetailPage.module.scss";
import styles from "./hours-services/HoursServices.module.scss";

interface ActivityHoursServicesTabProps {
    activity: V2Activity;
    tenantId: string;
    onReload: () => Promise<void>;
}

export const ActivityHoursServicesTab: React.FC<ActivityHoursServicesTabProps> = ({
    activity,
    tenantId,
    onReload,
}) => {
    const { showToast } = useToast();

    // Hours state
    const [hours, setHours] = useState<V2ActivityHours[]>([]);
    const [isHoursLoading, setIsHoursLoading] = useState(true);
    const [isHoursDrawerOpen, setIsHoursDrawerOpen] = useState(false);

    // Closures state
    const [closures, setClosures] = useState<V2ActivityClosure[]>([]);
    const [isClosuresLoading, setIsClosuresLoading] = useState(true);
    const [isClosureDrawerOpen, setIsClosureDrawerOpen] = useState(false);
    const [isClosureDeleteDrawerOpen, setIsClosureDeleteDrawerOpen] = useState(false);
    const [closureMode, setClosureMode] = useState<"create" | "edit">("create");
    const [selectedClosure, setSelectedClosure] = useState<V2ActivityClosure | undefined>();

    const loadHours = useCallback(async () => {
        try {
            setIsHoursLoading(true);
            setHours(await listActivityHours(activity.id, tenantId));
        } catch {
            showToast({ message: "Errore nel caricamento degli orari.", type: "error" });
        } finally {
            setIsHoursLoading(false);
        }
    }, [activity.id, tenantId, showToast]);

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
        loadHours();
        loadClosures();
    }, [loadHours, loadClosures]);

    const handleHoursSaved = useCallback(async () => {
        await Promise.all([loadHours(), onReload()]);
    }, [loadHours, onReload]);

    const handleActivitySaved = useCallback(async () => {
        await onReload();
    }, [onReload]);

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

    const isLoading = isHoursLoading || isClosuresLoading;

    if (isLoading) {
        return (
            <div className={pageStyles.loadingState}>
                <IconLoader2 className="animate-spin" size={32} />
                <p>Caricamento orari e servizi...</p>
            </div>
        );
    }

    return (
        <div className={styles.tabLayout}>
            <ActivityHoursSection
                hours={hours}
                activity={activity}
                onEditRequest={() => setIsHoursDrawerOpen(true)}
            />
            <ActivityClosuresSection
                closures={closures}
                onCreateRequest={openCreateClosure}
                onEditRequest={openEditClosure}
                onDeleteRequest={openDeleteClosure}
            />
            <PaymentMethodsSection
                activity={activity}
                tenantId={tenantId}
                onSaved={handleActivitySaved}
            />
            <ServicesSection
                activity={activity}
                tenantId={tenantId}
                onSaved={handleActivitySaved}
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
                onSuccess={handleClosureSaved}
            />
            <ActivityClosureDeleteDrawer
                open={isClosureDeleteDrawerOpen}
                onClose={() => setIsClosureDeleteDrawerOpen(false)}
                closure={selectedClosure}
                tenantId={tenantId}
                onSuccess={handleClosureSaved}
            />
        </div>
    );
};
