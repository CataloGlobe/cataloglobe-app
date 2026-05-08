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
import {
    listSchedulesUsingStyle,
    type StyleScheduleUsage
} from "@/services/supabase/layoutScheduling";
import { IconAlertTriangle } from "@tabler/icons-react";
import pageStyles from "./Styles.module.scss";
import drawerStyles from "./StyleDeleteDrawer.module.scss";

const MAX_VISIBLE_SCHEDULES = 10;

type ScheduleStatus = "active" | "scheduled" | "expired" | "disabled";

const STATUS_LABEL: Record<ScheduleStatus, string> = {
    active: "Attiva",
    scheduled: "Programmata",
    expired: "Scaduta",
    disabled: "Disabilitata"
};

const STATUS_PILL_CLASS: Record<ScheduleStatus, string> = {
    active: drawerStyles.pillActive,
    scheduled: drawerStyles.pillScheduled,
    expired: drawerStyles.pillExpired,
    disabled: drawerStyles.pillDisabled
};

function deriveScheduleStatus(rule: StyleScheduleUsage, now: Date): ScheduleStatus {
    if (!rule.enabled) return "disabled";
    if (rule.end_at !== null && new Date(rule.end_at) < now) return "expired";
    if (rule.start_at !== null && new Date(rule.start_at) > now) return "scheduled";
    return "active";
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
        } catch (err) {
            console.warn("[StyleDeleteDrawer] usage fetch failed:", err);
            setSchedulesUsing([]);
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
                                                const status = deriveScheduleStatus(rule, now);
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
