import React, { useCallback, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { V2Activity } from "@/types/activity";
import {
    ActivityVisibilityContent,
    type VisibilityContentMeta
} from "../components/ActivityVisibilityDrawer/ActivityVisibilityContent";
import styles from "./ActivityAvailabilityTab.module.scss";

interface ActivityAvailabilityTabProps {
    activity: V2Activity;
    tenantId: string;
    onReload: () => Promise<void>;
}

export const ActivityAvailabilityTab: React.FC<ActivityAvailabilityTabProps> = ({ activity }) => {
    const [meta, setMeta] = useState<VisibilityContentMeta | null>(null);

    const handleMeta = useCallback((m: VisibilityContentMeta) => {
        setMeta(m);
    }, []);

    const hasActiveCatalog = meta?.catalogId !== null && meta?.catalogId !== undefined;

    return (
        <div className={styles.layout}>
            {hasActiveCatalog && (
                <div className={styles.banner}>
                    <div className={styles.bannerIcon}>
                        <AlertCircle size={20} />
                    </div>
                    <div className={styles.bannerBody}>
                        <p className={styles.bannerTitle}>
                            Stai modificando la disponibilità solo per {activity.name}
                        </p>
                        <p className={styles.bannerDesc}>
                            Le modifiche non influenzano le altre sedi né il catalogo globale.
                        </p>
                        <p className={styles.bannerMeta}>
                            Catalogo attivo:{" "}
                            <strong>{meta?.catalogName ?? "—"}</strong>
                        </p>
                    </div>
                </div>
            )}
            <ActivityVisibilityContent
                activityId={activity.id}
                onMetaChange={handleMeta}
            />
        </div>
    );
};
