import React, { useState } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { deleteActivityClosure } from "@/services/supabase/activityClosures";
import { useToast } from "@/context/Toast/ToastContext";
import type { V2ActivityClosure } from "@/types/activity-closures";
import styles from "./HoursServices.module.scss";

function formatClosureTitle(c: V2ActivityClosure): string {
    const d = new Date(c.closure_date + "T12:00:00");
    const dateStr = d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
    if (c.end_date) {
        const e = new Date(c.end_date + "T12:00:00");
        const endStr = e.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
        return `${dateStr} – ${endStr}`;
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

export function ActivityClosureDeleteDrawer({
    open,
    onClose,
    closure,
    tenantId,
    onSuccess,
}: Props) {
    const { showToast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (!closure) return;
        setIsDeleting(true);
        try {
            await deleteActivityClosure(closure.id, tenantId);
            showToast({ message: "Chiusura eliminata.", type: "success" });
            await onSuccess();
            onClose();
        } catch (err: unknown) {
            const msg = (err as Error).message ?? "Errore durante l'eliminazione.";
            showToast({ message: msg, type: "error" });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={480}>
            <DrawerLayout
                header={
                    <div>
                        <Text variant="title-sm" weight={600}>
                            Elimina chiusura
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Questa azione non può essere annullata.
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
                            Annulla
                        </Button>
                        <Button
                            variant="danger"
                            onClick={handleDelete}
                            loading={isDeleting}
                        >
                            Elimina
                        </Button>
                    </>
                }
            >
                {closure && (
                    <div className={styles.closureDeleteBox}>
                        <IconAlertTriangle
                            size={20}
                            className={styles.closureDeleteIcon}
                        />
                        <div className={styles.closureDeleteText}>
                            <Text variant="body-sm" weight={600}>
                                {formatClosureTitle(closure)}
                                {closure.label ? ` — ${closure.label}` : ""}
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                La chiusura verrà rimossa definitivamente.
                            </Text>
                        </div>
                    </div>
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}
