import React, { useState, useEffect } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import {
    deleteAttributeDefinition,
    V2ProductAttributeDefinition
} from "@/services/supabase/v2/attributes";
import { IconAlertTriangle } from "@tabler/icons-react";
import styles from "./Attributes.module.scss";

type AttributeDeleteDrawerProps = {
    open: boolean;
    onClose: () => void;
    attributeData: V2ProductAttributeDefinition | null;
    onSuccess: () => void;
};

export function AttributeDeleteDrawer({
    open,
    onClose,
    attributeData,
    onSuccess
}: AttributeDeleteDrawerProps) {
    const { showToast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (open) {
            setIsDeleting(false);
        }
    }, [open]);

    const handleDelete = async () => {
        if (!attributeData) return;

        setIsDeleting(true);
        try {
            await deleteAttributeDefinition(attributeData.id, attributeData.tenant_id);
            showToast({ message: "Attributo eliminato con successo.", type: "success" });
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error("Errore nell'eliminazione dell'attributo:", error);
            showToast({
                message: error.message || "Impossibile eliminare l'attributo.",
                type: "error"
            });
        } finally {
            setIsDeleting(false);
        }
    };

    if (!attributeData) return null;

    return (
        <SystemDrawer open={open} onClose={onClose}>
            <DrawerLayout
                header={
                    <div className={styles.drawerHeader}>
                        <Text variant="title-sm" weight={600} colorVariant="error">
                            Elimina Attributo
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
                            Annulla
                        </Button>
                        <Button variant="danger" onClick={handleDelete} loading={isDeleting}>
                            Conferma Eliminazione
                        </Button>
                    </>
                }
            >
                <div>
                    <div className={styles.warningBox}>
                        <IconAlertTriangle
                            size={24}
                            style={{
                                flexShrink: 0,
                                marginTop: 2,
                                color: "var(--color-warning-500)"
                            }}
                        />
                        <div>
                            <Text variant="body-sm" weight={600}>
                                Attenzione
                            </Text>
                            <Text variant="body-sm">
                                Eliminando questa definizione perderai automaticamente tutti i
                                valori che i prodotti hanno salvato per questo attributo.
                            </Text>
                        </div>
                    </div>

                    <Text variant="body" style={{ display: "block" }}>
                        Stai per eliminare l'attributo <strong>{attributeData.label}</strong> (
                        {attributeData.code}). Questa operazione non è reversibile.
                    </Text>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
