import React, { useState, useEffect } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { deleteProductGroup, ProductGroup } from "@/services/supabase/productGroups";
import { IconAlertTriangle } from "@tabler/icons-react";
import styles from "./ProductGroupsTab.module.scss";

type ProductGroupDeleteDrawerProps = {
    open: boolean;
    onClose: () => void;
    groupData: ProductGroup | null;
    onSuccess: () => void;
};

export function ProductGroupDeleteDrawer({
    open,
    onClose,
    groupData,
    onSuccess
}: ProductGroupDeleteDrawerProps) {
    const { showToast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (open) {
            setIsDeleting(false);
        }
    }, [open]);

    const handleDelete = async () => {
        if (!groupData) return;

        setIsDeleting(true);
        try {
            await deleteProductGroup(groupData.id);
            showToast({ message: "Gruppo eliminato con successo.", type: "success" });
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error("Errore nell'eliminazione del gruppo:", error);
            showToast({
                message:
                    error.message ||
                    "Impossibile eliminare il gruppo. Verifica che non abbia sottogruppi o prodotti associati.",
                type: "error"
            });
        } finally {
            setIsDeleting(false);
        }
    };

    if (!groupData) return null;

    const header = (
        <div>
            <Text variant="title-sm" weight={600} colorVariant="error">
                Elimina gruppo
            </Text>
        </div>
    );

    const footer = (
        <>
            <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
                Annulla
            </Button>
            <Button
                variant="danger"
                onClick={handleDelete}
                loading={isDeleting}
                disabled={isDeleting}
            >
                Elimina
            </Button>
        </>
    );

    return (
        <SystemDrawer open={open} onClose={onClose}>
            <DrawerLayout header={header} footer={footer}>
                <div className={styles.formBody}>
                    <div className={styles.modalContent}>
                        <div className={styles.modalIcon}>
                            <IconAlertTriangle size={48} stroke={1} />
                        </div>
                        <div
                            style={{
                                textAlign: "center",
                                display: "flex",
                                flexDirection: "column",
                                gap: 12
                            }}
                        >
                            <Text variant="body" weight={600}>
                                Vuoi davvero eliminare il gruppo "{groupData.name}"?
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                Questa operazione è irreversibile. I sottogruppi e i prodotti
                                associati non verranno eliminati, ma perderanno il riferimento a
                                questo gruppo se la base dati lo consente.
                            </Text>
                        </div>
                    </div>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
