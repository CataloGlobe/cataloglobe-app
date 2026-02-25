import React, { useState, useEffect } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { deleteProduct, V2Product } from "@/services/supabase/v2/products";
import { IconAlertTriangle } from "@tabler/icons-react";
import styles from "./Products.module.scss";

type ProductDeleteDrawerProps = {
    open: boolean;
    onClose: () => void;
    productData: V2Product | null;
    onSuccess: () => void;
};

export function ProductDeleteDrawer({
    open,
    onClose,
    productData,
    onSuccess
}: ProductDeleteDrawerProps) {
    const { showToast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);

    const hasVariants = productData?.variants && productData.variants.length > 0;
    const isVariant = !!productData?.parent_product_id;

    useEffect(() => {
        if (open) {
            setIsDeleting(false);
        }
    }, [open]);

    const handleDelete = async () => {
        if (!productData) return;

        setIsDeleting(true);
        try {
            await deleteProduct(productData.id, productData.tenant_id, hasVariants);
            const successMsg = hasVariants
                ? "Prodotto e tutte le sue varianti sono stati eliminati con successo."
                : "Prodotto eliminato con successo.";

            showToast({ message: successMsg, type: "success" });
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error("Errore nell'eliminazione del prodotto:", error);
            showToast({
                message: error.message || "Impossibile eliminare il prodotto.",
                type: "error"
            });
        } finally {
            setIsDeleting(false);
        }
    };

    if (!productData) return null;

    return (
        <SystemDrawer open={open} onClose={onClose}>
            <DrawerLayout
                header={
                    <div className={styles.drawerHeader}>
                        <Text variant="title-sm" weight={600} colorVariant="error">
                            Elimina {isVariant ? "Variante" : "Prodotto"}
                        </Text>
                    </div>
                }
                footer={
                    <div className={styles.drawerFooterContainer}>
                        <div className={styles.drawerFooter}>
                            <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
                                Annulla
                            </Button>
                            <Button variant="danger" onClick={handleDelete} loading={isDeleting}>
                                {hasVariants ? "Elimina tutto" : "Conferma Eliminazione"}
                            </Button>
                        </div>
                    </div>
                }
            >
                <div className={styles.deleteContent}>
                    {hasVariants ? (
                        <>
                            <div className={styles.warningBox}>
                                <IconAlertTriangle
                                    size={24}
                                    className={styles.warningIcon}
                                    color="var(--color-warning-500)"
                                />
                                <div>
                                    <Text variant="body-sm" weight={600}>
                                        Attenzione: il prodotto ha {productData.variants!.length}{" "}
                                        varianti.
                                    </Text>
                                    <Text variant="body-sm">
                                        Eliminando il prodotto base{" "}
                                        <strong>{productData.name}</strong>, eliminerai
                                        automaticamente anche tutte le varianti ad esso associate.
                                    </Text>
                                </div>
                            </div>
                            <Text variant="body">
                                Questa operazione non è reversibile. Vuoi eliminarle tutte?
                            </Text>
                        </>
                    ) : (
                        <Text variant="body" style={{ display: "block" }}>
                            Stai per eliminare {isVariant ? "la variante" : "il prodotto"}{" "}
                            <strong>{productData.name}</strong>. Questa operazione non è
                            reversibile.
                        </Text>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
