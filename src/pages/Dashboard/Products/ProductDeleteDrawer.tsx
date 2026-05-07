import React, { useState, useEffect } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import {
    deleteProduct,
    countProductDeleteImpact,
    V2Product,
    type ProductDeleteImpact
} from "@/services/supabase/products";
import { IconAlertTriangle } from "@tabler/icons-react";
import styles from "./Products.module.scss";

type ProductDeleteDrawerProps = {
    open: boolean;
    onClose: () => void;
    productData: V2Product | null;
    onSuccess: () => void;
};

type ImpactItem = { count: number; singular: string; plural: string };

function buildImpactItems(impact: ProductDeleteImpact): ImpactItem[] {
    return [
        { count: impact.catalogs, singular: "catalogo", plural: "cataloghi" },
        {
            count: impact.featured,
            singular: "contenuto in evidenza",
            plural: "contenuti in evidenza"
        },
        { count: impact.schedules, singular: "programmazione", plural: "programmazioni" }
    ].filter(item => item.count > 0);
}

function formatImpactSentence(items: ImpactItem[]): string {
    return items
        .map(item => `${item.count} ${item.count === 1 ? item.singular : item.plural}`)
        .join(", ");
}

export function ProductDeleteDrawer({
    open,
    onClose,
    productData,
    onSuccess
}: ProductDeleteDrawerProps) {
    const { showToast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);
    const [impact, setImpact] = useState<ProductDeleteImpact | null>(null);

    const hasVariants = productData?.variants && productData.variants.length > 0;
    const isVariant = !!productData?.parent_product_id;

    useEffect(() => {
        if (!open || !productData) return;
        setIsDeleting(false);
        setImpact(null);
        let cancelled = false;
        countProductDeleteImpact(productData.id, productData.tenant_id)
            .then(result => {
                if (!cancelled) setImpact(result);
            })
            .catch(err => {
                console.warn("[ProductDeleteDrawer] impact fetch failed:", err);
            });
        return () => {
            cancelled = true;
        };
    }, [open, productData]);

    const handleDelete = async () => {
        if (!productData) return;

        setIsDeleting(true);
        try {
            await deleteProduct(productData.id, productData.tenant_id);

            const impactItems = impact ? buildImpactItems(impact) : [];
            let message: string;
            if (hasVariants && impactItems.length > 0) {
                message = `Prodotto e varianti eliminati. Rimosso da ${formatImpactSentence(
                    impactItems
                )}.`;
            } else if (hasVariants) {
                message = "Prodotto e tutte le sue varianti sono stati eliminati con successo.";
            } else if (impactItems.length > 0) {
                message = `Prodotto eliminato. Rimosso da ${formatImpactSentence(impactItems)}.`;
            } else {
                message = "Prodotto eliminato con successo.";
            }

            showToast({ message, type: "success" });
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Errore nell'eliminazione del prodotto:", error);
            const fallback = "Impossibile eliminare il prodotto.";
            const message = error instanceof Error && error.message ? error.message : fallback;
            showToast({ message, type: "error" });
        } finally {
            setIsDeleting(false);
        }
    };

    if (!productData) return null;

    const impactItems = impact ? buildImpactItems(impact) : [];

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
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
                            Annulla
                        </Button>
                        <Button variant="danger" onClick={handleDelete} loading={isDeleting}>
                            {hasVariants ? "Elimina tutto" : "Conferma Eliminazione"}
                        </Button>
                    </>
                }
            >
                <div>
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
                        <div className={styles.warningBox}>
                            <IconAlertTriangle
                                size={24}
                                className={styles.warningIcon}
                                color="var(--color-warning-500)"
                            />
                            <div>
                                <Text variant="body" weight={600}>
                                    Azione distruttiva permanente
                                </Text>
                                <Text variant="body-sm" style={{ marginTop: 4 }}>
                                    Stai per eliminare {isVariant ? "la variante" : "il prodotto"}{" "}
                                    <strong>{productData.name}</strong>. Il prodotto verrà rimosso
                                    automaticamente da tutti i cataloghi, contenuti in evidenza e
                                    programmazioni associate.
                                </Text>
                            </div>
                        </div>
                    )}

                    {impactItems.length > 0 && (
                        <div className={styles.impactSection}>
                            <div className={styles.impactTitle}>
                                <Text variant="body-sm" weight={600}>
                                    Questo prodotto è utilizzato in:
                                </Text>
                            </div>
                            <ul className={styles.impactList}>
                                {impactItems.map(item => (
                                    <li key={item.singular}>
                                        <Text variant="body-sm">
                                            {item.count}{" "}
                                            {item.count === 1 ? item.singular : item.plural}
                                        </Text>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
