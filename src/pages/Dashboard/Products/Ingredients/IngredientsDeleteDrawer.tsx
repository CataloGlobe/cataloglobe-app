import React, { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useToast } from "@/context/Toast/ToastContext";
import { deleteIngredient, V2Ingredient } from "@/services/supabase/ingredients";
import styles from "./Ingredients.module.scss";

type IngredientsDeleteDrawerProps = {
    open: boolean;
    onClose: () => void;
    ingredientData: V2Ingredient | null;
    tenantId: string;
    onSuccess: () => void;
};

export function IngredientsDeleteDrawer({
    open,
    onClose,
    ingredientData,
    tenantId,
    onSuccess
}: IngredientsDeleteDrawerProps) {
    const { showToast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (open) {
            setIsDeleting(false);
        }
    }, [open]);

    const handleDelete = async () => {
        if (!ingredientData) return;

        setIsDeleting(true);
        try {
            await deleteIngredient(ingredientData.id, tenantId);
            showToast({ message: "Ingrediente eliminato con successo.", type: "success" });
            onSuccess();
            onClose();
        } catch (error: unknown) {
            console.error("Errore nell'eliminazione dell'ingrediente:", error);
            const isFK =
                error instanceof Object &&
                "code" in error &&
                (error as { code: string }).code === "23503";
            showToast({
                message: isFK
                    ? "Impossibile eliminare: ingrediente utilizzato da uno o più prodotti."
                    : error instanceof Error
                    ? error.message
                    : "Impossibile eliminare l'ingrediente.",
                type: "error"
            });
        } finally {
            setIsDeleting(false);
        }
    };

    if (!ingredientData) return null;

    return (
        <SystemDrawer open={open} onClose={onClose} width={420}>
            <DrawerLayout
                header={
                    <div className={styles.drawerHeader}>
                        <Text variant="title-sm" weight={600} colorVariant="error">
                            Elimina Ingrediente
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
                            style={{ flexShrink: 0, marginTop: 2, color: "var(--color-warning-500)" }}
                        />
                        <div>
                            <Text variant="body-sm" weight={600}>
                                Attenzione
                            </Text>
                            <Text variant="body-sm">
                                Sei sicuro di voler eliminare l&apos;ingrediente{" "}
                                <strong>{ingredientData.name}</strong>? Questa operazione non è
                                reversibile.
                            </Text>
                        </div>
                    </div>
                    <p className={styles.deleteMessage}>
                        L&apos;ingrediente verrà rimosso dal tuo catalogo. Se è associato a dei
                        prodotti, la cancellazione non sarà consentita.
                    </p>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
