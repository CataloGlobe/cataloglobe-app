import React, { useState, useEffect } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { deleteStyle, V2Style } from "@/services/supabase/styles";
import { IconAlertTriangle } from "@tabler/icons-react";
import styles from "./Styles.module.scss";

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

    const isSystemError = styleData?.is_system;
    const isUsed = (styleData?.usage_count || 0) > 0;

    // Filter out the current style from replacement options
    const replacementOptions = allStyles
        .filter(s => s.id !== styleData?.id)
        .map(s => ({
            value: s.id,
            label: s.name
        }));

    useEffect(() => {
        if (open) {
            setReplacementId("");
            setIsDeleting(false);
        }
    }, [open]);

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
        } catch (error: any) {
            console.error("Errore nell'eliminazione dello stile:", error);
            showToast({
                message: error.message || "Impossibile eliminare lo stile.",
                type: "error"
            });
        } finally {
            setIsDeleting(false);
        }
    };

    if (!styleData) return null;

    return (
        <SystemDrawer open={open} onClose={onClose}>
            <DrawerLayout
                header={
                    <div className={styles.drawerHeader}>
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
                            >
                                Conferma Eliminazione
                            </Button>
                        )}
                    </>
                }
            >
                <div>
                    {isSystemError ? (
                        <div className={styles.warningBox}>
                            <IconAlertTriangle
                                size={24}
                                className={styles.warningIcon}
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
                            <Text variant="body" style={{ marginBottom: "24px", display: "block" }}>
                                Stai per eliminare lo stile <strong>{styleData.name}</strong>.
                                Questa operazione eliminerà anche tutte le sue versioni e non è
                                reversibile.
                            </Text>

                            {isUsed && (
                                <div className={styles.replacementBox}>
                                    <Text
                                        variant="body-sm"
                                        weight={600}
                                        style={{ marginBottom: "8px" }}
                                    >
                                        Stile attualmente in uso
                                    </Text>
                                    <Text
                                        variant="body-sm"
                                        colorVariant="muted"
                                        style={{ marginBottom: "16px" }}
                                    >
                                        Questo stile è associato a {styleData.usage_count} regola/e
                                        di layout. Seleziona uno stile alternativo per sostituirlo
                                        prima dell'eliminazione:
                                    </Text>

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
