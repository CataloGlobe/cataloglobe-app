import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight } from "lucide-react";
import type { V2Activity } from "@/types/activity";
import { getRenderableCatalogForActivity } from "@/services/supabase/activeCatalog";
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

type ActiveSchedule = { id: string; name: string };

export const ActivityAvailabilityTab: React.FC<ActivityAvailabilityTabProps> = ({
    activity,
    tenantId
}) => {
    const [meta, setMeta] = useState<VisibilityContentMeta | null>(null);
    const [activeSchedule, setActiveSchedule] = useState<ActiveSchedule | null>(null);

    const handleMeta = useCallback((m: VisibilityContentMeta) => {
        setMeta(m);
    }, []);

    useEffect(() => {
        let cancelled = false;
        getRenderableCatalogForActivity(activity.id, tenantId)
            .then(r => {
                if (!cancelled) setActiveSchedule(r.activeSchedule);
            })
            .catch(() => {
                if (!cancelled) setActiveSchedule(null);
            });
        return () => {
            cancelled = true;
        };
    }, [activity.id, tenantId]);

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
                            {activeSchedule && (
                                <>
                                    <span className={styles.bannerSep}>·</span>
                                    Regola: <strong>{activeSchedule.name}</strong>
                                    <span className={styles.bannerSep}>·</span>
                                    <Link
                                        to={`/business/${tenantId}/scheduling/${activeSchedule.id}`}
                                        className={styles.bannerLink}
                                    >
                                        Gestisci regola
                                        <ArrowRight size={13} />
                                    </Link>
                                </>
                            )}
                        </p>
                    </div>
                </div>
            )}
            <ActivityVisibilityContent
                activityId={activity.id}
                onMetaChange={handleMeta}
                countPlacement="top"
            />
        </div>
    );
};
