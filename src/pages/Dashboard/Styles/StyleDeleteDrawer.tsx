import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { supabase } from "@/services/supabase/client";
import { deleteStyle, V2Style } from "@/services/supabase/styles";
import { getActivities } from "@/services/supabase/activities";
import {
    listSchedulesUsingStyle,
    type StyleScheduleUsage
} from "@/services/supabase/layoutScheduling";
import { isRuleCurrentlyActive } from "@/utils/ruleHelpers";
import { ruleReachesAnyActivity } from "@/utils/scheduleReach";
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
    // Serve solo a deriveScheduleStatus (portata zero, Passo 4): sedi
    // esistenti del tenant + membri dei gruppi puntati dalle regole trovate
    // sopra. Nessuna competizione fra regole qui (vedi scheduleStatus.ts).
    const [activityIdSet, setActivityIdSet] = useState<Set<string>>(new Set());
    const [groupMemberCounts, setGroupMemberCounts] = useState<Map<string, number>>(new Map());

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
            const data = await listSchedulesUsingStyle(currentTenantId, styleData.id);
            setSchedulesUsing(data);

            const groupIds = Array.from(new Set(data.flatMap(rule => rule.groupIds)));
            const [activities, memberRows] = await Promise.all([
                getActivities(currentTenantId),
                groupIds.length > 0
                    ? supabase
                          .from("activity_group_members")
                          .select("group_id")
                          .eq("tenant_id", currentTenantId)
                          .in("group_id", groupIds)
                          .then(res => {
                              if (res.error) throw res.error;
                              return res.data ?? [];
                          })
                    : Promise.resolve([])
            ]);

            setActivityIdSet(new Set(activities.map(a => a.id)));
            const counts = new Map<string, number>();
            for (const row of memberRows) {
                counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
            }
            setGroupMemberCounts(counts);
        } catch (err) {
            console.warn("[StyleDeleteDrawer] usage fetch failed:", err);
            setSchedulesUsing([]);
            setActivityIdSet(new Set());
            setGroupMemberCounts(new Map());
        } finally {
            setIsLoadingUsage(false);
        }
    }, [styleData, currentTenantId]);

    useEffect(() => {
        if (!open || !styleData) {
            setReplacementId("");
            setSchedulesUsing(null);
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
                                                const isZeroReach = !ruleReachesAnyActivity(
                                                    {
                                                        applyToAll: rule.applyToAll,
                                                        activityIds: rule.activityIds,
                                                        groupIds: rule.groupIds
                                                    },
                                                    {
                                                        activityExists: id => activityIdSet.has(id),
                                                        groupMemberCount: id =>
                                                            groupMemberCounts.get(id) ?? 0
                                                    }
                                                );
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
                                                    isZeroReach,
                                                    isActiveNow: isRuleCurrentlyActive(rule, now),
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
