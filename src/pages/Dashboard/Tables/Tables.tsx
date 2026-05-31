import { useCallback, useEffect, useMemo, useState } from "react";

import { TablesManagement } from "@/components/Tables/TablesManagement/TablesManagement";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { getActivities } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";

import styles from "./Tables.module.scss";

export default function Tables() {
    const tenantId = useTenantId();
    const { showToast } = useToast();

    const [activities, setActivities] = useState<V2Activity[]>([]);
    const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

    const loadActivities = useCallback(async () => {
        if (!tenantId) return;
        try {
            const data = await getActivities(tenantId);
            setActivities(data);
            setSelectedActivityId(prev => prev ?? (data.length > 0 ? data[0].id : null));
        } catch {
            showToast({ message: "Impossibile caricare le sedi", type: "error" });
        }
    }, [tenantId, showToast]);

    useEffect(() => {
        void loadActivities();
    }, [loadActivities]);

    const selectedActivity = useMemo(
        () => activities.find(a => a.id === selectedActivityId) ?? null,
        [activities, selectedActivityId]
    );

    return (
        <section className={styles.container}>
            {activities.length > 1 && (
                <div className={styles.activitySelector}>
                    <label htmlFor="activity-select" className={styles.activitySelectorLabel}>
                        Sede:
                    </label>
                    <select
                        id="activity-select"
                        className={styles.activitySelect}
                        value={selectedActivityId ?? ""}
                        onChange={e => setSelectedActivityId(e.target.value || null)}
                    >
                        {activities.map(a => (
                            <option key={a.id} value={a.id}>
                                {a.name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {tenantId && selectedActivityId ? (
                <TablesManagement
                    tenantId={tenantId}
                    activityId={selectedActivityId}
                    orderingEnabled={selectedActivity?.ordering_enabled ?? false}
                    mode="page"
                />
            ) : null}
        </section>
    );
}
