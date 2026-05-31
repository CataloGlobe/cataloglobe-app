import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { Switch } from "@/components/ui/Switch/Switch";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { useTenantId } from "@/context/useTenantId";
import {
    getActivityProductOverrides,
    getRenderableCatalogForActivity,
    updateActivityProductVisibility,
    type RenderableCatalog,
    type RenderableProduct
} from "@/services/supabase/activeCatalog";
import { getDisplayPrice } from "@/utils/priceDisplay";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./ActivityVisibilityContent.module.scss";

type FilterValue = "all" | "visible" | "hidden";

export type VisibilityContentMeta = {
    catalogId: string | null;
    catalogName: string | null;
};

type ActivityVisibilityContentProps = {
    activityId: string;
    onMetaChange?: (meta: VisibilityContentMeta) => void;
};

export const ActivityVisibilityContent: React.FC<ActivityVisibilityContentProps> = ({
    activityId,
    onMetaChange
}) => {
    const tenantId = useTenantId();
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [catalog, setCatalog] = useState<RenderableCatalog | null>(null);
    const [overrides, setOverrides] = useState<
        Record<string, { visible_override: boolean | null }>
    >({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<FilterValue>("all");

    const onMetaChangeRef = useRef(onMetaChange);
    useEffect(() => {
        onMetaChangeRef.current = onMetaChange;
    }, [onMetaChange]);

    const loadData = useCallback(async () => {
        if (!tenantId) return;
        setIsLoading(true);
        try {
            const [cat, ovs] = await Promise.all([
                getRenderableCatalogForActivity(activityId, tenantId),
                getActivityProductOverrides(activityId)
            ]);
            setCatalog(cat);
            setOverrides(ovs);
            onMetaChangeRef.current?.({
                catalogId: cat.catalogId,
                catalogName: cat.catalogName
            });
        } catch (e) {
            console.error("Error loading visibility data:", e);
            showToast({ message: "Errore nel caricamento della disponibilità.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [activityId, tenantId, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleToggle = async (productId: string, currentVisible: boolean) => {
        if (!tenantId) return;
        setSavingId(productId);
        try {
            await updateActivityProductVisibility(activityId, productId, !currentVisible);
            const [cat, ovs] = await Promise.all([
                getRenderableCatalogForActivity(activityId, tenantId),
                getActivityProductOverrides(activityId)
            ]);
            setCatalog(cat);
            setOverrides(ovs);
        } catch (e) {
            console.error("Error updating visibility:", e);
            showToast({ message: "Errore durante l'aggiornamento.", type: "error" });
        } finally {
            setSavingId(null);
        }
    };

    const filtered = useMemo(() => {
        const products = catalog?.products ?? [];
        const term = search.trim().toLowerCase();
        return products.filter(p => {
            if (filter === "visible" && !p.is_visible) return false;
            if (filter === "hidden" && p.is_visible) return false;
            if (!term) return true;
            const inName = p.name.toLowerCase().includes(term);
            const inCategory = p.category_name?.toLowerCase().includes(term) ?? false;
            return inName || inCategory;
        });
    }, [catalog, search, filter]);

    const hiddenCount = useMemo(
        () => (catalog?.products ?? []).filter(p => !p.is_visible).length,
        [catalog]
    );

    const columns = useMemo<ColumnDefinition<RenderableProduct>[]>(
        () => [
            {
                id: "product",
                header: "Prodotto",
                width: "2fr",
                cell: (_, product) => {
                    const ov = overrides[product.product_id]?.visible_override;
                    const isOverridden = ov !== undefined && ov !== null;
                    return (
                        <div className={styles.productCell}>
                            <div className={styles.productNameRow}>
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
                        {
                            getDisplayPrice({
                                base_price: product.final_price,
                                from_price: product.from_price
                            }).label
                        }
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
                                handleToggle(product.product_id, product.is_visible)
                            }
                            disabled={savingId === product.product_id}
                        />
                    </div>
                )
            }
        ],
        [overrides, savingId]
    );

    if (isLoading) {
        return (
            <div className={styles.loading}>
                <Skeleton height={40} />
                <Skeleton height={40} />
                <Skeleton height={40} />
            </div>
        );
    }

    if (!catalog || !catalog.catalogId) {
        return (
            <div className={styles.emptyState}>
                <Text variant="body" weight={600}>
                    Nessun catalogo attivo
                </Text>
                <Text variant="body-sm" colorVariant="muted">
                    Le impostazioni di disponibilità saranno disponibili quando una regola di
                    programmazione assegnerà un catalogo a questa sede.
                </Text>
            </div>
        );
    }

    if (catalog.products.length === 0) {
        return (
            <div className={styles.emptyState}>
                <Text variant="body" weight={600}>
                    Catalogo senza prodotti
                </Text>
                <Text variant="body-sm" colorVariant="muted">
                    Il catalogo attivo non contiene prodotti.
                </Text>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.toolbar}>
                <div className={styles.searchWrap}>
                    <Search size={16} className={styles.searchIcon} />
                    <input
                        type="text"
                        className={styles.searchInput}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Cerca prodotto…"
                    />
                </div>
                <div className={styles.filters}>
                    {(["all", "visible", "hidden"] as FilterValue[]).map(f => (
                        <button
                            key={f}
                            type="button"
                            className={`${styles.filterPill} ${
                                filter === f ? styles.filterPillActive : ""
                            }`}
                            onClick={() => setFilter(f)}
                        >
                            {f === "all" ? "Tutti" : f === "visible" ? "Visibili" : "Nascosti"}
                        </button>
                    ))}
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className={styles.emptyFilter}>
                    <Text variant="body-sm" colorVariant="muted">
                        Nessun prodotto corrispondente ai filtri.
                    </Text>
                </div>
            ) : (
                <div className={styles.tableWrapper}>
                    <DataTable
                        data={filtered}
                        columns={columns}
                        getRowId={p => p.product_id}
                        disabledRowIds={savingId ? [savingId] : []}
                    />
                </div>
            )}

            <div className={styles.footer}>
                <Text variant="caption" colorVariant="muted">
                    {catalog.products.length} prodotti totali · {hiddenCount} nascost
                    {hiddenCount === 1 ? "o" : "i"}
                </Text>
            </div>
        </div>
    );
};
