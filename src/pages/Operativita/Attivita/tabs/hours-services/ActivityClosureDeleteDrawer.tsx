import React, { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { deleteActivityClosure } from "@/services/supabase/activityClosures";
import { useToast } from "@/context/Toast/ToastContext";
import type { V2ActivityClosure } from "@/types/activity-closures";

function formatClosureTitle(c: V2ActivityClosure): string {
    const d = new Date(c.closure_date + "T12:00:00");
    const dateStr = d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
    if (c.end_date) {
        const e = new Date(c.end_date + "T12:00:00");
        return `${dateStr} – ${e.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}`;
    }
    return dateStr;
}

type Props = {
    open: boolean;
    onClose: () => void;
    closure?: V2ActivityClosure;
    tenantId: string;
    onSuccess: () => void | Promise<void>;
};

/**
 * Eliminare una chiusura è una riga senza dipendenze: `ConfirmDialog`, non
 * un drawer (registro Sedi #59).
 */
export function ActivityClosureDeleteDrawer({ open, onClose, closure, tenantId, onSuccess }: Props) {
    const { showToast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async (): Promise<boolean> => {
        if (!closure) return false;
        setIsDeleting(true);
        try {
            await deleteActivityClosure(closure.id, tenantId);
            showToast({ message: "Chiusura eliminata.", type: "success" });
            await onSuccess();
            return true;
        } catch (err: unknown) {
            showToast({ message: (err as Error).message ?? "Impossibile eliminare la chiusura.", type: "error" });
            return false;
        } finally {
            setIsDeleting(false);
        }
    };

    const name = closure ? `${closure.label ? `${closure.label} · ` : ""}${formatClosureTitle(closure)}` : "";

    return (
        <ConfirmDialog
            isOpen={open && closure !== undefined}
            onClose={onClose}
            onConfirm={handleDelete}
            title={`Elimina la chiusura «${name}»?`}
            message="Il giorno torna agli orari normali."
            confirmLabel="Elimina"
            confirmVariant="danger"
            isLoading={isDeleting}
        />
    );
}
