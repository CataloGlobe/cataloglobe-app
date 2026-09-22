import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import {
    ActivityVisibilityContent,
    type VisibilityContentMeta
} from "../components/ActivityVisibilityDrawer/ActivityVisibilityContent";
import { useActivityDetail } from "../ActivityDetailContext";
import { getRenderableCatalogForActivity } from "@/services/supabase/activeCatalog";
import styles from "./ActivityDisponibilitaRoute.module.scss";

type ActiveSchedule = { id: string; name: string };

/**
 * Disponibilità: cosa trova chi inquadra il QR di questa sede, adesso.
 * Rotta senza tab, raggiunta da «Gestisci» in Sedi; il drawer da 900 non
 * esiste più (§19.5). Diventerà «Cosa vedono i clienti» con la milestone
 * 7: esito e catena del resolver arrivano allora.
 */
export default function ActivityDisponibilitaRoute() {
    const { activity, tenantId } = useActivityDetail();
    const [meta, setMeta] = useState<VisibilityContentMeta | null>(null);
    const [activeSchedule, setActiveSchedule] = useState<ActiveSchedule | null>(null);

    const handleMeta = useCallback((m: VisibilityContentMeta) => setMeta(m), []);

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
                <InlineBanner
                    variant="info"
                    action={
                        activeSchedule ? (
                            <Link to={`/business/${tenantId}/scheduling/${activeSchedule.id}`} className={styles.link}>
                                Vedi la regola
                            </Link>
                        ) : undefined
                    }
                >
                    Stai modificando solo {activity.name}: le altre sedi e il catalogo non cambiano. Menù attivo:{" "}
                    <strong>{meta?.catalogName ?? "—"}</strong>
                    {activeSchedule && (
                        <>
                            {" "}
                            · regola <strong>{activeSchedule.name}</strong>
                        </>
                    )}
                </InlineBanner>
            )}
            <ActivityVisibilityContent activityId={activity.id} onMetaChange={handleMeta} countPlacement="top" />
        </div>
    );
}
