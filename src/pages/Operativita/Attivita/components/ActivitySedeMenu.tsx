import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PauseCircle, PencilLine, PlayCircle } from "lucide-react";
import { TableRowActions, type TableRowAction } from "@/components/ui/TableRowActions/TableRowActions";
import { rowAction } from "@/components/ui/TableRowActions/rowAction";
import { DeleteActivityDialog } from "@/components/Businesses/DeleteActivityDialog/DeleteActivityDialog";
import { SuspendActivityDialog } from "./SuspendActivityDialog";
import { updateActivity } from "@/services/supabase/activities";
import { useToast } from "@/context/Toast/ToastContext";
import { refreshActivitiesCache } from "@/hooks/activitiesCache";
import type { InactiveReason } from "@/utils/activityStatus";
import type { V2Activity } from "@/types/activity";

interface ActivitySedeMenuProps {
    activity: V2Activity;
    businessId: string;
    tenantId: string;
    reload: () => Promise<void> | void;
    canManage: boolean;
    canDelete: boolean;
}

/**
 * Il «⋯» della testata della Scheda (Officina 3, prototipo s3): sospendere o
 * riprendere la pubblicazione, cambiare il motivo, eliminare la sede. Erano
 * le righe «Stato» ed «Elimina la sede» di Pubblicazione; sono azioni
 * immediate, fuori dal draft.
 */
export function ActivitySedeMenu({ activity, businessId, tenantId, reload, canManage, canDelete }: ActivitySedeMenuProps) {
    const { showToast } = useToast();
    const navigate = useNavigate();
    const isActive = activity.status === "active";

    const [isSuspendOpen, setIsSuspendOpen] = useState(false);
    const [suspendMode, setSuspendMode] = useState<"suspend" | "edit-reason">("suspend");
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    // Riferimento stabile: il dialogo ricalcola l'impatto a ogni cambio di
    // `activity`, e un oggetto nuovo a ogni render annullava il conteggio in volo.
    const deleteTarget = useMemo(() => ({ id: activity.id, name: activity.name }), [activity.id, activity.name]);

    const handleResume = useCallback(async () => {
        try {
            await updateActivity(activity.id, tenantId, { status: "active", inactive_reason: null });
            void refreshActivitiesCache(tenantId);
            await reload();
            showToast({ message: "Sede pubblicata.", type: "success" });
        } catch {
            showToast({ message: "Impossibile riprendere la pubblicazione.", type: "error" });
        }
    }, [activity.id, tenantId, reload, showToast]);

    const handleSuspendConfirm = useCallback(
        async (reason: InactiveReason): Promise<boolean> => {
            try {
                if (suspendMode === "edit-reason") {
                    await updateActivity(activity.id, tenantId, { inactive_reason: reason });
                    await reload();
                    showToast({ message: "Motivo aggiornato.", type: "success" });
                } else {
                    await updateActivity(activity.id, tenantId, { status: "inactive", inactive_reason: reason });
                    // «Sospesa» compare accanto alla sede nell'header (§51.7).
                    void refreshActivitiesCache(tenantId);
                    await reload();
                    showToast({ message: "Sede sospesa.", type: "success" });
                }
                return true;
            } catch {
                showToast({
                    message: suspendMode === "edit-reason" ? "Impossibile aggiornare il motivo." : "Impossibile sospendere la sede.",
                    type: "error"
                });
                return false;
            }
        },
        [activity.id, tenantId, suspendMode, reload, showToast]
    );

    const openSuspend = (mode: "suspend" | "edit-reason") => {
        setSuspendMode(mode);
        setIsSuspendOpen(true);
    };

    const actions: TableRowAction[] = [
        {
            label: "Sospendi la pubblicazione",
            icon: PauseCircle,
            description: "Chi apre il link legge il motivo, non il menù",
            onClick: () => openSuspend("suspend"),
            hidden: !canManage || !isActive
        },
        {
            label: "Riprendi la pubblicazione",
            icon: PlayCircle,
            onClick: () => void handleResume(),
            hidden: !canManage || isActive
        },
        {
            label: "Cambia il motivo",
            icon: PencilLine,
            onClick: () => openSuspend("edit-reason"),
            hidden: !canManage || isActive
        },
        { ...rowAction.remove(() => setIsDeleteOpen(true), { hidden: !canDelete }), label: "Elimina la sede…" }
    ];

    if (!actions.some(a => !a.hidden)) return null;

    return (
        <>
            <TableRowActions actions={actions} ariaLabel="Azioni sede" />
            <SuspendActivityDialog
                isOpen={isSuspendOpen}
                onClose={() => setIsSuspendOpen(false)}
                onConfirm={handleSuspendConfirm}
                mode={suspendMode}
                initialReason={suspendMode === "edit-reason" ? activity.inactive_reason : null}
            />
            <DeleteActivityDialog
                isOpen={isDeleteOpen}
                activity={deleteTarget}
                businessId={businessId}
                tenantId={tenantId}
                onClose={() => setIsDeleteOpen(false)}
                onDeleted={() => navigate(`/business/${businessId}/locations`)}
            />
        </>
    );
}
