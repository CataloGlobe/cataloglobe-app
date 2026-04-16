import React, { useState, useEffect, useCallback } from "react";
import { IconLoader2 } from "@tabler/icons-react";
import { listActivityHours } from "@/services/supabase/activityHours";
import type { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import { useToast } from "@/context/Toast/ToastContext";
import { ActivityHoursSection } from "./hours-services/ActivityHoursSection";
import { ActivityHoursDrawer } from "./hours-services/ActivityHoursDrawer";
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
    onReload
}) => {
    const { showToast } = useToast();
    const [hours, setHours] = useState<V2ActivityHours[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isHoursDrawerOpen, setIsHoursDrawerOpen] = useState(false);

    const loadHours = useCallback(async () => {
        try {
            setIsLoading(true);
            setHours(await listActivityHours(activity.id, tenantId));
        } catch {
            showToast({ message: "Errore nel caricamento degli orari.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [activity.id, tenantId, showToast]);

    useEffect(() => {
        loadHours();
    }, [loadHours]);

    const handleHoursSaved = useCallback(async () => {
        await Promise.all([loadHours(), onReload()]);
    }, [loadHours, onReload]);

    const handleActivitySaved = useCallback(async () => {
        await onReload();
    }, [onReload]);

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
        </div>
    );
};
