import React, { useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Lock } from "lucide-react";
import { usePlanFeatures } from "@/lib/planFeatures";
import { Card } from "@/components/ui";
import { PrerequisitesRow, type PrerequisiteItem } from "@/components/ui/PrerequisitesRow/PrerequisitesRow";
import { Switch } from "@/components/ui/Switch/Switch";
import { PrintersSection } from "./printers/PrintersSection";
import { updateActivityOrderingEnabled } from "@/services/supabase/activities";
import { useToast } from "@/context/Toast/ToastContext";
import type { V2Activity } from "@/types/activity";
// Card, header e caption "piano Pro" sono le stesse delle altre tab della
// sede: il modulo di Impostazioni resta l'unica fonte (stesso precedente di
// `ActivityHoursSection` / `ActivityClosuresSection`). Qui solo ciò che è
// specifico di questa tab.
import cardStyles from "./ActivitySettingsTab.module.scss";
import styles from "./ActivityOrderingTab.module.scss";

interface ActivityOrderingTabProps {
    activity: V2Activity;
    tenantId: string;
    onReload: () => Promise<void>;
    /** `activity.manage` sulla sede: senza, il toggle si vede ma non si tocca. */
    canWrite?: boolean;
}

/**
 * Tab "Ordinazioni": interruttore QR + stampanti della sede.
 * Feature gating solo UX (`table_ordering`): il toggle resta visibile e
 * disabilitato con la caption, l'enforcement vero è server-side.
 */
export const ActivityOrderingTab: React.FC<ActivityOrderingTabProps> = ({
    activity,
    tenantId,
    onReload,
    canWrite = true
}) => {
    const { showToast } = useToast();
    const { hasFeature } = usePlanFeatures();
    const isOrderingLocked = !hasFeature("table_ordering");

    const handleOrderingEnabledToggle = useCallback(
        async (checked: boolean) => {
            try {
                await updateActivityOrderingEnabled(activity.id, tenantId, checked);
                showToast({
                    message: checked
                        ? "Ordinazioni QR riattivate"
                        : "Ordinazioni QR sospese. I clienti vedranno il menu ma non potranno ordinare.",
                    type: "success"
                });
                await onReload();
            } catch {
                showToast({
                    message: "Impossibile aggiornare lo stato delle ordinazioni.",
                    type: "error"
                });
            }
        },
        [activity.id, tenantId, onReload, showToast]
    );

    // Prerequisiti accertabili senza letture nuove: la riga sede è già qui.
    // "Tavoli mappati" e "menù pubblicato" costerebbero un fetch a testa
    // (lista tavoli, resolver catalogo) e restano fuori per scelta.
    const prerequisites: PrerequisiteItem[] = [
        {
            id: "published",
            label: "Sede pubblicata",
            ok: activity.status === "active",
            consequence:
                "Finché la sede è sospesa la pagina pubblica non è raggiungibile e il QR del tavolo non porta da nessuna parte.",
            actionLabel: "Vai a Impostazioni",
            href: `/business/${tenantId}/locations/${activity.id}?tab=settings`
        }
    ];

    return (
        <div className={cardStyles.layout}>
            <PrerequisitesRow items={prerequisites} />
            <Card className={cardStyles.card}>
                <div className={cardStyles.cardHeader}>
                    <div className={cardStyles.cardHeaderText}>
                        <h3 className={cardStyles.cardTitle}>Ordinazioni dal tavolo</h3>
                        <p className={cardStyles.cardSubtitle}>
                            Sospendi temporaneamente la ricezione di ordini dal QR senza chiudere la sede.
                        </p>
                    </div>
                </div>
                <div className={styles.toggleBody}>
                    <Switch
                        checked={activity.ordering_enabled}
                        onChange={handleOrderingEnabledToggle}
                        disabled={isOrderingLocked || !canWrite}
                        label="Ordinazioni QR abilitate"
                        description={
                            activity.ordering_enabled
                                ? "I clienti possono ordinare scansionando il QR del tavolo."
                                : "I clienti vedono il menu in sola lettura. Il tasto Invia ordine e' disabilitato. Riattiva quando vuoi accettare nuovamente ordini al tavolo."
                        }
                    />
                    {isOrderingLocked && (
                        <div className={cardStyles.lockedFeatureCaption}>
                            <Lock size={14} strokeWidth={1.5} />
                            <span>Disponibile con il piano Pro</span>
                        </div>
                    )}
                </div>
            </Card>

            {activity.ordering_enabled && (
                <Card className={cardStyles.card}>
                    <div className={cardStyles.cardHeader}>
                        <div className={cardStyles.cardHeaderText}>
                            <h3 className={cardStyles.cardTitle}>Stampanti</h3>
                            <p className={cardStyles.cardSubtitle}>
                                Collega le stampanti cloud Sunmi della sede per ricevere le comande in cucina.
                            </p>
                        </div>
                    </div>
                    <div className={cardStyles.cardBodyFlat}>
                        <PrintersSection tenantId={tenantId} activityId={activity.id} />
                    </div>
                </Card>
            )}

            {/* Qui si configura, in Ordini si lavora: il rimando chiude la tab. */}
            <p className={styles.operativeLink}>
                Le comande arrivano qui:{" "}
                <Link to={`/business/${tenantId}/orders`} className={styles.operativeLinkAnchor}>
                    Ordini
                    <ArrowRight size={13} />
                </Link>
            </p>
        </div>
    );
};
