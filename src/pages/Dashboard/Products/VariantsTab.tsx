import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import Text from "@/components/ui/Text/Text";
import { V2Product } from "@/services/supabase/products";
import { GroupWithValues, getProductOptions } from "@/services/supabase/productOptions";
import styles from "./VariantsTab.module.scss";

function computeFromPrice(group: GroupWithValues | null | undefined, fallback: number | null): number | null {
    if (group === undefined) return null;
    if (group !== null && group.values.length > 0) {
        const prices = group.values.map(v => v.absolute_price).filter((p): p is number => p !== null);
        return prices.length > 0 ? Math.min(...prices) : null;
    }
    return fallback;
}

interface VariantsTabProps {
    product: V2Product;
    tenantId: string;
    onOpenVariantDrawer: () => void;
    onVariantUpdated: () => void;
}

export function VariantsTab({
    product,
    onOpenVariantDrawer,
}: VariantsTabProps) {
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
            parent={product}
            variants={variants}
            onOpenVariantDrawer={onOpenVariantDrawer}
        />
    );
}

// =============================================================================
// Inner component (hooks always called unconditionally)
// =============================================================================

function VariantsTabContent({
    parent,
    variants,
    onOpenVariantDrawer,
}: {
    parent: V2Product;
    variants: V2Product[];
    onOpenVariantDrawer: () => void;
}) {
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();

    // undefined = not yet loaded, null = no formats group
    const [variantOptions, setVariantOptions] = useState<Record<string, GroupWithValues | null>>({});
    const [parentGroup, setParentGroup] = useState<GroupWithValues | null | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        void getProductOptions(parent.id).then(opts => {
            if (!cancelled) setParentGroup(opts.primaryPriceGroup);
        }).catch(() => {
            if (!cancelled) setParentGroup(null);
        });
        return () => { cancelled = true; };
    }, [parent.id]);

    useEffect(() => {
        if (variants.length === 0) {
            setVariantOptions({});
            return;
        }
        let cancelled = false;
        void Promise.all(
            variants.map(v =>
                getProductOptions(v.id).then(opts => ({ id: v.id, group: opts.primaryPriceGroup }))
            )
        ).then(results => {
            if (cancelled) return;
            const map: Record<string, GroupWithValues | null> = {};
            for (const r of results) { map[r.id] = r.group; }
            setVariantOptions(map);
        }).catch(() => {
            // silent — price cells fall back to "—"
        });
        return () => { cancelled = true; };
    }, [variants]);

    const parentEffectivePrice = computeFromPrice(parentGroup, parent.base_price);

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
            cell: (_, variant) => {
                const group = variantOptions[variant.id];
                // still loading
                if (group === undefined) {
                    return <Text variant="body" colorVariant="muted">—</Text>;
                }
                // formats mode: "da X.XX €"
                const fromPrice = computeFromPrice(group, null);
                if (group !== null && group.values.length > 0) {
                    return fromPrice !== null ? (
                        <Text variant="body">da {fromPrice.toFixed(2)} €</Text>
                    ) : (
                        <Text variant="body" colorVariant="muted">—</Text>
                    );
                }
                // simple mode: own price
                if (variant.base_price != null) {
                    return <Text variant="body">{variant.base_price.toFixed(2)} €</Text>;
                }
                // inherit mode: show parent's effective price
                if (parentEffectivePrice !== null) {
                    return (
                        <Text variant="body-sm" colorVariant="muted">
                            {parentEffectivePrice.toFixed(2)} € (ereditato)
                        </Text>
                    );
                }
                return <Text variant="body" colorVariant="muted">—</Text>;
            },
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
