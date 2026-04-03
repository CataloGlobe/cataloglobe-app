import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { V2Product, updateProduct } from "@/services/supabase/products";
import styles from "./VariantsTab.module.scss";

interface VariantsTabProps {
    product: V2Product;
    tenantId: string;
    onOpenVariantDrawer: () => void;
    onVariantUpdated: () => void;
}

export function VariantsTab({
    product,
    tenantId,
    onOpenVariantDrawer,
    onVariantUpdated
}: VariantsTabProps) {
    const { showToast } = useToast();

    if (product.parent_product_id !== null) {
        return (
            <div className={styles.variantProductNote}>
                <Text variant="body-sm" colorVariant="muted">
                    Questo prodotto è una variante. I prodotti variante non possono avere proprie sotto-varianti.
                </Text>
            </div>
        );
    }

    const variants = [...(product.variants ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, "it")
    );

    return (
        <VariantsTabContent
            tenantId={tenantId}
            variants={variants}
            onOpenVariantDrawer={onOpenVariantDrawer}
            onVariantUpdated={onVariantUpdated}
            showToast={showToast}
        />
    );
}

// =============================================================================
// Inner component (hooks always called unconditionally)
// =============================================================================

function VariantsTabContent({
    tenantId,
    variants,
    onOpenVariantDrawer,
    onVariantUpdated,
    showToast
}: {
    tenantId: string;
    variants: V2Product[];
    onOpenVariantDrawer: () => void;
    onVariantUpdated: () => void;
    showToast: ReturnType<typeof useToast>["showToast"];
}) {
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();
    const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
    const [savingId, setSavingId] = useState<string | null>(null);

    useEffect(() => {
        const drafts: Record<string, string> = {};
        for (const v of variants) {
            drafts[v.id] = v.base_price != null ? v.base_price.toFixed(2) : "";
        }
        setPriceDraft(drafts);
    }, [variants]);

    const handlePriceBlur = async (variant: V2Product) => {
        const draft = priceDraft[variant.id] ?? "";
        const parsed = draft === "" ? null : parseFloat(draft);
        const newPrice =
            parsed !== null && !isNaN(parsed)
                ? Math.round(parsed * 100) / 100
                : null;

        if (newPrice === variant.base_price) return;
        if (savingId) return;

        try {
            setSavingId(variant.id);
            await updateProduct(variant.id, tenantId, { base_price: newPrice });
            onVariantUpdated();
            showToast({ message: "Prezzo aggiornato", type: "success" });
        } catch {
            showToast({ message: "Errore aggiornamento prezzo", type: "error" });
            setPriceDraft(prev => ({
                ...prev,
                [variant.id]: variant.base_price != null ? variant.base_price.toFixed(2) : ""
            }));
        } finally {
            setSavingId(null);
        }
    };

    const handlePriceKeyDown = (
        e: React.KeyboardEvent<HTMLInputElement>,
        variant: V2Product
    ) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
            setPriceDraft(prev => ({
                ...prev,
                [variant.id]: variant.base_price != null ? variant.base_price.toFixed(2) : ""
            }));
            e.currentTarget.blur();
        }
    };

    const columns: ColumnDefinition<V2Product>[] = [
        {
            id: "name",
            header: "Nome",
            cell: (_, variant) => (
                <Text variant="body" weight={500}>{variant.name}</Text>
            ),
        },
        {
            id: "price",
            header: "Prezzo",
            width: "160px",
            cell: (_, variant) => (
                <NumberInput
                    value={priceDraft[variant.id] ?? ""}
                    onChange={e =>
                        setPriceDraft(prev => ({
                            ...prev,
                            [variant.id]: e.target.value
                        }))
                    }
                    onBlur={() => handlePriceBlur(variant)}
                    onKeyDown={e => handlePriceKeyDown(e, variant)}
                    disabled={savingId === variant.id}
                    placeholder="—"
                    min={0}
                    step={0.01}
                    endAdornment="€"
                    containerClassName={styles.priceInput}
                />
            ),
        },
        {
            id: "actions",
            header: "",
            width: "48px",
            align: "right",
            cell: (_, variant) => (
                <TableRowActions
                    actions={[
                        {
                            label: "Modifica",
                            onClick: () => navigate(`/business/${businessId}/products/${variant.id}`),
                        },
                    ]}
                />
            ),
        },
    ];

    return (
        <div className={styles.root}>
            {/* Section header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <Text variant="title-sm" weight={600}>Varianti</Text>
                    {variants.length > 0 && (
                        <Badge variant="secondary">{variants.length}</Badge>
                    )}
                    <Text variant="body-sm" colorVariant="muted">
                        Versioni alternative di questo prodotto
                    </Text>
                </div>
                <Button variant="secondary" size="sm" onClick={onOpenVariantDrawer}>
                    Aggiungi variante
                </Button>
            </div>

            {/* Variant table */}
            <DataTable
                data={variants}
                columns={columns}
                density="compact"
                onRowClick={variant => navigate(`/business/${businessId}/products/${variant.id}`)}
                emptyState={
                    <div className={styles.emptyState}>
                        <Text variant="body-sm" colorVariant="muted">
                            Non hai ancora creato varianti per questo prodotto.
                        </Text>
                        <Button variant="secondary" size="sm" onClick={onOpenVariantDrawer}>
                            Aggiungi variante
                        </Button>
                    </div>
                }
            />
        </div>
    );
}
