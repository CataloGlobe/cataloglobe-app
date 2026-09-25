import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { deleteStyle, V2Style } from "@/services/supabase/styles";
import { getActivities } from "@/services/supabase/activities";
import { listActivityIdsByGroup } from "@/services/supabase/activity-groups";
import {
    listLayoutRulesForCompetition,
    listSchedulesUsingStyle,
    type LayoutCompetitionRule,
    type StyleScheduleUsage
} from "@/services/supabase/layoutScheduling";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";
import { computeRuleInsights } from "@/utils/ruleInsights";
import { isTimeRuleActiveNow } from "@shared/scheduleCompetition";
import { deriveScheduleStatus, type ScheduleStatus } from "@/utils/scheduleStatus";
import { IconAlertTriangle } from "@tabler/icons-react";
import pageStyles from "./Styles.module.scss";
import drawerStyles from "./StyleDeleteDrawer.module.scss";

const MAX_VISIBLE_SCHEDULES = 10;

const STATUS_LABEL: Record<ScheduleStatus, string> = {
    draft: "Bozza",
    active: "Attiva",
    scheduled: "Programmata",
    expired: "Scaduta",
    disabled: "Disabilitata"
};

const STATUS_PILL_CLASS: Record<ScheduleStatus, string> = {
    draft: drawerStyles.pillDraft,
    active: drawerStyles.pillActive,
    scheduled: drawerStyles.pillScheduled,
    expired: drawerStyles.pillExpired,
    disabled: drawerStyles.pillDisabled
};

/** Ripiego senza i dati della competizione: la sola finestra, all'ora di Roma. */
function isInWindowNow(rule: StyleScheduleUsage, now: Date): boolean {
    return rule.enabled && isTimeRuleActiveNow(rule, toRomeDateTime(now));
}

function StatusPill({ status }: { status: ScheduleStatus }) {
    return (
        <span className={`${drawerStyles.pill} ${STATUS_PILL_CLASS[status]}`}>
            {STATUS_LABEL[status]}
        </span>
    );
}

type StyleDeleteDrawerProps = {
    open: boolean;
    onClose: () => void;
    styleData: V2Style | null;
    allStyles: V2Style[];
    onSuccess: () => void;
};

export function StyleDeleteDrawer({
    open,
    onClose,
    styleData,
    allStyles,
    onSuccess
}: StyleDeleteDrawerProps) {
    const { showToast } = useToast();
    const currentTenantId = useTenantId();
    const [isDeleting, setIsDeleting] = useState(false);
    const [replacementId, setReplacementId] = useState<string>("");
    const [schedulesUsing, setSchedulesUsing] = useState<StyleScheduleUsage[] | null>(null);
    const [isLoadingUsage, setIsLoadingUsage] = useState(false);
    // La competizione (§34.4): tutte le regole menù dell'azienda, le sedi e
    // i membri dei gruppi. Dà a deriveScheduleStatus la finestra all'ora di
    // Roma e la portata zero; chi sovrascrive una regola dello stile è
    // calcolato ma non ancora mostrato (arriva col lotto della matrice, §20).
    const [competition, setCompetition] = useState<{
        rules: LayoutCompetitionRule[];
        activities: Array<{ id: string; name: string }>;
        activityIdsByGroupId: Record<string, string[]>;
    } | null>(null);

    const isSystemError = styleData?.is_system;
    const isUsed = (styleData?.usage_count || 0) > 0;

    const replacementOptions = allStyles
        .filter(s => s.id !== styleData?.id)
        .map(s => ({
            value: s.id,
            label: s.name
        }));

    const loadUsage = useCallback(async (): Promise<void> => {
        if (!styleData || !currentTenantId) return;
        setIsLoadingUsage(true);
        try {
            setSchedulesUsing(await listSchedulesUsingStyle(currentTenantId, styleData.id));
        } catch (err) {
            console.warn("[StyleDeleteDrawer] usage fetch failed:", err);
            setSchedulesUsing([]);
            setIsLoadingUsage(false);
            return;
        }
        try {
            const [rules, activities] = await Promise.all([
                listLayoutRulesForCompetition(currentTenantId),
                getActivities(currentTenantId)
            ]);
            const activityIdsByGroupId = await listActivityIdsByGroup(
                Array.from(new Set(rules.flatMap(rule => rule.groupIds)))
            );
            setCompetition({
                rules,
                activities: activities.map(activity => ({ id: activity.id, name: activity.name })),
                activityIdsByGroupId
            });
        } catch (err) {
            // Senza competizione lo stato resta calcolabile dalla sola finestra.
            console.warn("[StyleDeleteDrawer] competition fetch failed:", err);
            setCompetition(null);
        } finally {
            setIsLoadingUsage(false);
        }
    }, [styleData, currentTenantId]);

    useEffect(() => {
        if (!open || !styleData) {
            setReplacementId("");
            setSchedulesUsing(null);
            setCompetition(null);
            setIsDeleting(false);
            return;
        }
        if (isSystemError || !isUsed) {
            setSchedulesUsing([]);
            return;
        }
        void loadUsage();
    }, [open, styleData, isSystemError, isUsed, loadUsage]);

    const handleDelete = async () => {
        if (!styleData) return;

        if (isUsed && !replacementId) {
            showToast({
                message: "Seleziona uno stile sostitutivo prima di procedere.",
                type: "error"
            });
            return;
        }

        setIsDeleting(true);
        try {
            await deleteStyle(styleData.id, currentTenantId!, isUsed ? replacementId : undefined);
            const successMsg = isUsed
                ? "Stile eliminato e associazioni aggiornate con successo."
                : "Stile eliminato con successo.";

            showToast({ message: successMsg, type: "success" });
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Errore nell'eliminazione dello stile:", error);
            showToast({
                message: "Impossibile eliminare lo stile. Riprova più tardi.",
                type: "error"
            });
        } finally {
            setIsDeleting(false);
        }
    };

    if (!styleData) return null;

    const blocking = schedulesUsing ?? [];
    const visibleSchedules = blocking.slice(0, MAX_VISIBLE_SCHEDULES);
    const hiddenCount = blocking.length - visibleSchedules.length;
    const now = new Date();
    const insights = competition
        ? computeRuleInsights({
              rules: competition.rules,
              activities: competition.activities,
              activityIdsByGroupId: competition.activityIdsByGroupId,
              groupNameById: new Map(),
              filterActivityId: null,
              now,
              ruleName: rule => rule.name ?? ""
          })
        : null;

    const usageCopy = replacementId
        ? "Queste regole useranno lo stile selezionato:"
        : "Seleziona uno stile sostitutivo per le seguenti regole:";

    return (
        <SystemDrawer open={open} onClose={onClose}>
            <DrawerLayout
                header={
                    <div className={pageStyles.drawerHeader}>
                        <Text variant="title-sm" weight={600} colorVariant="error">
                            Elimina Stile
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
                            Annulla
                        </Button>
                        {!isSystemError && (
                            <Button
                                variant="danger"
                                onClick={handleDelete}
                                loading={isDeleting}
                                disabled={isDeleting || isLoadingUsage || (isUsed && !replacementId)}
                            >
                                Conferma Eliminazione
                            </Button>
                        )}
                    </>
                }
            >
                <div className={drawerStyles.body}>
                    {isSystemError ? (
                        <div className={pageStyles.warningBox}>
                            <IconAlertTriangle
                                size={24}
                                className={pageStyles.warningIcon}
                                color="var(--color-warning-500)"
                            />
                            <div>
                                <Text variant="body-sm" weight={600}>
                                    Impossibile eliminare
                                </Text>
                                <Text variant="body-sm">
                                    Lo stile <strong>{styleData.name}</strong> è lo stile
                                    predefinito del tenant e non può essere rimosso. Per
                                    personalizzarlo, duplicalo e modifica la copia.
                                </Text>
                            </div>
                        </div>
                    ) : (
                        <>
                            <Text variant="body">
                                Stai per eliminare lo stile <strong>{styleData.name}</strong>.
                                Questa operazione eliminerà anche tutte le sue versioni e non è
                                reversibile.
                            </Text>

                            {isUsed && (
                                <div className={pageStyles.replacementBox}>
                                    <Text variant="body-sm" weight={600}>
                                        Stile attualmente in uso
                                    </Text>
                                    <Text variant="body-sm" colorVariant="muted">
                                        {usageCopy}
                                    </Text>

                                    {isLoadingUsage && (
                                        <div className={drawerStyles.usageLoading}>
                                            <Text variant="body-sm" colorVariant="muted">
                                                Caricamento regole...
                                            </Text>
                                        </div>
                                    )}

                                    {!isLoadingUsage && blocking.length > 0 && (
                                        <ul className={drawerStyles.scheduleList}>
                                            {visibleSchedules.map(rule => {
                                                const insight = insights?.get(rule.id);
                                                const status = deriveScheduleStatus({
                                                    enabled: rule.enabled,
                                                    endAt: rule.end_at,
                                                    // Il payload dello stile (catalog_id) non è
                                                    // caricato qui: "nessun target" copre già il
                                                    // caso pratico rilevante per questo drawer.
                                                    isConfigDraft:
                                                        !rule.applyToAll &&
                                                        rule.activityIds.length === 0 &&
                                                        rule.groupIds.length === 0,
                                                    isZeroReach: insight?.isNeverUsed ?? false,
                                                    isActiveNow:
                                                        insight?.isActiveNow ?? isInWindowNow(rule, now),
                                                    now
                                                });
                                                return (
                                                    <li
                                                        key={rule.id}
                                                        className={drawerStyles.scheduleItem}
                                                    >
                                                        <Link
                                                            to={`/business/${currentTenantId}/scheduling/${rule.id}`}
                                                            className={drawerStyles.scheduleLink}
                                                        >
                                                            <Text
                                                                variant="body-sm"
                                                                className={drawerStyles.scheduleName}
                                                            >
                                                                {rule.name ?? "Regola senza nome"}
                                                            </Text>
                                                            <StatusPill status={status} />
                                                        </Link>
                                                    </li>
                                                );
                                            })}
                                            {hiddenCount > 0 && (
                                                <li className={drawerStyles.scheduleItem}>
                                                    <Link
                                                        to={`/business/${currentTenantId}/scheduling`}
                                                        className={drawerStyles.scheduleMoreLink}
                                                    >
                                                        <Text variant="body-sm" colorVariant="muted">
                                                            Altre {hiddenCount}{" "}
                                                            {hiddenCount === 1 ? "regola" : "regole"}...
                                                        </Text>
                                                    </Link>
                                                </li>
                                            )}
                                        </ul>
                                    )}

                                    <Select
                                        label="Sostituisci con stile"
                                        required
                                        value={replacementId}
                                        onChange={e => setReplacementId(e.target.value)}
                                        options={[
                                            { value: "", label: "Seleziona uno stile..." },
                                            ...replacementOptions
                                        ]}
                                    />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
