import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { PageGate } from "@/components/PageGate/PageGate";
import { usePermissions } from "@/context/PermissionsContext";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { canDoOnActivity } from "@/lib/permissions";
import {
    ActivityVisibilityContent,
    type VisibilityContentMeta
} from "../components/ActivityVisibility/ActivityVisibilityContent";
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
    const { permissions } = usePermissions();
    const { canEdit } = useSubscriptionGuard();
    // Legge chi legge la sede; scrive chi ha `activity.manage` (le RLS di
    // `activity_product_overrides`) con l'abbonamento attivo (D2).
    const canRead = permissions != null && canDoOnActivity(permissions, "activity.read", activity.id);
    const hasWritePermission = permissions != null && canDoOnActivity(permissions, "activity.manage", activity.id);
    const canWrite = hasWritePermission && canEdit;
    const [meta, setMeta] = useState<VisibilityContentMeta | null>(null);
    const [activeSchedule, setActiveSchedule] = useState<ActiveSchedule | null>(null);

    const handleMeta = useCallback((m: VisibilityContentMeta) => setMeta(m), []);

    useEffect(() => {
        if (!canRead) return;
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
    }, [activity.id, tenantId, canRead]);

    const hasActiveCatalog = meta?.catalogId !== null && meta?.catalogId !== undefined;

    if (permissions != null && !canRead) {
        return <PageGate readPermission="activity.read" activityId={activity.id}>{() => null}</PageGate>;
    }

    return (
        <div className={styles.layout}>
            {!canWrite && permissions != null && (
                <InlineBanner variant="info">
                    {hasWritePermission
                        ? "Sola lettura: l'abbonamento non è attivo."
                        : "Sola lettura: per cambiare la disponibilità serve un ruolo da manager della sede in su."}
                </InlineBanner>
            )}
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
                    {canWrite ? `Stai modificando solo ${activity.name}: le altre sedi e il catalogo non cambiano. ` : ""}
                    Menù attivo:{" "}
                    <strong>{meta?.catalogName ?? "—"}</strong>
                    {activeSchedule && (
                        <>
                            {" "}
                            · regola <strong>{activeSchedule.name}</strong>
                        </>
                    )}
                </InlineBanner>
            )}
            {canRead && (
                <ActivityVisibilityContent
                    activityId={activity.id}
                    onMetaChange={handleMeta}
                    readOnly={!canWrite}
                />
            )}
        </div>
    );
}
