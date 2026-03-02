import React, { useEffect, useState, useCallback, useMemo } from "react";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui";
import { Switch } from "@/components/ui/Switch/Switch";
import { Badge } from "@/components/ui/Badge/Badge";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import {
    getRenderableCatalogForActivity,
    getActivityProductOverrides,
    updateActivityProductVisibility,
    type RenderableProduct,
    type RenderableCatalog
} from "@/services/supabase/v2/activeCatalog";
import styles from "./BusinessAvailabilityModal.module.scss";
import Skeleton from "@/components/ui/Skeleton/Skeleton";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    activityId: string;
    activityName: string;
}

export const BusinessAvailabilityModal: React.FC<Props> = ({
    isOpen,
    onClose,
    activityId,
    activityName
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [catalog, setCatalog] = useState<RenderableCatalog | null>(null);
    const [overrides, setOverrides] = useState<
        Record<string, { visible_override: boolean | null }>
    >({});
    const [isSavingRecord, setIsSavingRecord] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [cat, ovs] = await Promise.all([
                getRenderableCatalogForActivity(activityId),
                getActivityProductOverrides(activityId)
            ]);
            setCatalog(cat);
            setOverrides(ovs);
        } catch (error) {
            console.error("Error loading availability data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [activityId]);

    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen, loadData]);

    const handleToggleVisibility = async (productId: string, currentEffectiveVisible: boolean) => {
        setIsSavingRecord(productId);
        try {
            await updateActivityProductVisibility(activityId, productId, !currentEffectiveVisible);

            // Ricarichiamo i dati
            const [cat, ovs] = await Promise.all([
                getRenderableCatalogForActivity(activityId),
                getActivityProductOverrides(activityId)
            ]);
            setCatalog(cat);
            setOverrides(ovs);
        } catch (error) {
            console.error("Error updating visibility:", error);
        } finally {
            setIsSavingRecord(null);
        }
    };

    const columns = useMemo<ColumnDefinition<RenderableProduct>[]>(
        () => [
            {
                id: "product",
                header: "Prodotto",
                width: "2fr",
                cell: (_, product) => {
                    const isOverridden =
                        overrides[product.product_id]?.visible_override !== undefined &&
                        overrides[product.product_id]?.visible_override !== null;

                    return (
                        <div className={styles.productCell}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <Text weight={600} variant="body-sm">
                                    {product.name}
                                </Text>
                                {isOverridden && <Badge variant="primary">Override</Badge>}
                            </div>
                            {product.category_name && (
                                <Text variant="caption" colorVariant="muted">
                                    {product.category_name}
                                </Text>
                            )}
                        </div>
                    );
                }
            },
            {
                id: "price",
                header: "Prezzo",
                width: "100px",
                align: "right",
                cell: (_, product) => (
                    <Text variant="body-sm" weight={500}>
                        € {product.final_price.toFixed(2)}
                    </Text>
                )
            },
            {
                id: "visibility",
                header: "Visibile",
                width: "100px",
                align: "right",
                cell: (_, product) => (
                    <div onClick={e => e.stopPropagation()}>
                        <Switch
                            checked={product.is_visible}
                            onChange={() =>
                                handleToggleVisibility(product.product_id, product.is_visible)
                            }
                            disabled={isSavingRecord === product.product_id}
                        />
                    </div>
                )
            }
        ],
        [overrides, isSavingRecord]
    );

    const hasNoCatalog = !isLoading && (!catalog || !catalog.catalogId);
    const hasNoProducts = !isLoading && catalog && catalog.products.length === 0;

    return (
        <ModalLayout isOpen={isOpen} onClose={onClose} width="md" height="fit">
            <ModalLayoutHeader>
                <div className={styles.header}>
                    <Text as="h2" variant="title-md" weight={700}>
                        Gestisci disponibilità
                    </Text>
                    <Text variant="caption" colorVariant="muted">
                        Attività: {activityName}{" "}
                        {catalog?.catalogName && `• Catalogo: ${catalog.catalogName}`}
                    </Text>
                </div>
                <Button variant="secondary" onClick={onClose} size="sm">
                    Chiudi
                </Button>
            </ModalLayoutHeader>

            <ModalLayoutContent>
                <div className={styles.container}>
                    {isLoading ? (
                        <div className={styles.loading}>
                            <Skeleton height={40} />
                            <Skeleton height={40} />
                            <Skeleton height={40} />
                        </div>
                    ) : hasNoCatalog || hasNoProducts ? (
                        <div className={styles.empty}>
                            <Text variant="body" colorVariant="muted">
                                {hasNoCatalog
                                    ? "Nessun catalogo attivo per questa attività."
                                    : "Il catalogo attivo è vuoto."}
                            </Text>
                        </div>
                    ) : (
                        <div className={styles.tableWrapper}>
                            <DataTable
                                data={catalog?.products || []}
                                columns={columns}
                                rowClassName={product =>
                                    isSavingRecord === product.product_id
                                        ? styles.rowSaving
                                        : undefined
                                }
                            />
                        </div>
                    )}
                </div>
            </ModalLayoutContent>
        </ModalLayout>
    );
};
