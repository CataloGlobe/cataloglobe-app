import React, { useCallback, useEffect, useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { Card } from "@/components/ui/Card/Card";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import {
    IconPizza,
    IconDotsVertical,
    IconChevronDown,
    IconChevronRight
} from "@tabler/icons-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import styles from "./Products.module.scss";

import {
    listBaseProductsWithVariants,
    V2Product,
    duplicateProduct
} from "@/services/supabase/v2/products";
import { ProductCreateEditDrawer, ProductFormMode } from "./ProductCreateEditDrawer";
import { ProductDeleteDrawer } from "./ProductDeleteDrawer";
import ProductGroupsTab from "@/components/Products/ProductGroupsTab/ProductGroupsTab";

type ProductTableRow = {
    kind: "base" | "variant";
    product: V2Product;
    parent?: V2Product;
    hasVariants: boolean;
    visibleVariants: V2Product[];
    isExpanded: boolean;
};

export default function Products() {
    const { user } = useAuth();
    const currentTenantId = user?.id;
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [allProducts, setAllProducts] = useState<V2Product[]>([]);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    const [activeTab, setActiveTab] = useState<"products" | "groups">("products");
    const [isCreateGroupOpen, setCreateGroupOpen] = useState(false);

    // Filter State
    const [searchQuery, setSearchQuery] = useState("");
    const [showHidden] = useState(false);
    const [density, setDensity] = useState<"compact" | "extended">("compact");

    // Drawer States
    const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
    const [createEditMode, setCreateEditMode] = useState<ProductFormMode>("create_base");
    const [productToEdit, setProductToEdit] = useState<V2Product | null>(null);
    const [parentForVariant, setParentForVariant] = useState<V2Product | null>(null);

    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState<V2Product | null>(null);

    const loadData = useCallback(async () => {
        if (!currentTenantId) return;
        try {
            setIsLoading(true);
            const data = await listBaseProductsWithVariants(currentTenantId);
            setAllProducts(data);
        } catch (error) {
            console.error("Errore nel caricamento dei prodotti:", error);
            showToast({ message: "Non è stato possibile caricare i prodotti.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [currentTenantId, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const filteredProducts = useMemo(() => {
        return allProducts.filter(product => {
            // Visibility filter
            if (!showHidden && product.is_visible === false) {
                return false;
            }
            // Search filter
            if (searchQuery && !product.name.toLowerCase().includes(searchQuery.toLowerCase())) {
                // Check if any variant matches
                const variantsMatch = product.variants?.some(
                    v =>
                        v.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
                        (showHidden || v.is_visible !== false)
                );
                if (!variantsMatch) return false;
            }
            return true;
        });
    }, [allProducts, searchQuery, showHidden]);

    const tableRows = useMemo<ProductTableRow[]>(() => {
        const rows: ProductTableRow[] = [];

        filteredProducts.forEach(product => {
            const hasVariants = Boolean(product.variants?.length);
            const isExpanded = expandedRows.has(product.id);
            const visibleVariants =
                product.variants?.filter(v => showHidden || v.is_visible !== false) || [];

            rows.push({
                kind: "base",
                product,
                hasVariants,
                visibleVariants,
                isExpanded
            });

            if (isExpanded) {
                visibleVariants.forEach(variant => {
                    rows.push({
                        kind: "variant",
                        product: variant,
                        parent: product,
                        hasVariants: false,
                        visibleVariants: [],
                        isExpanded: false
                    });
                });
            }
        });

        return rows;
    }, [filteredProducts, expandedRows, showHidden]);

    // Handlers
    const handleCreateBase = () => {
        setCreateEditMode("create_base");
        setProductToEdit(null);
        setParentForVariant(null);
        setIsCreateEditOpen(true);
    };

    const handleCreateVariant = (baseProduct: V2Product) => {
        setCreateEditMode("create_variant");
        setProductToEdit(null);
        setParentForVariant(baseProduct);
        setIsCreateEditOpen(true);
        // Expand the row so the user sees the new variant when it's created
        setExpandedRows(prev => {
            const next = new Set(prev);
            next.add(baseProduct.id);
            return next;
        });
    };

    const handleEdit = (product: V2Product) => {
        setCreateEditMode("edit");
        setProductToEdit(product);
        setParentForVariant(null);
        setIsCreateEditOpen(true);
    };

    const handleDuplicate = async (product: V2Product) => {
        try {
            await duplicateProduct(product.id, currentTenantId!);
            showToast({ message: "Prodotto duplicato con successo.", type: "success" });
            loadData();
        } catch (error) {
            console.error("Errore durante la duplicazione del prodotto:", error);
            showToast({ message: "Errore durante la duplicazione del prodotto.", type: "error" });
        }
    };

    const handleDelete = (product: V2Product) => {
        setProductToDelete(product);
        setIsDeleteOpen(true);
    };

    const toggleRow = (id: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const columns: ColumnDefinition<ProductTableRow>[] = [
        {
            id: "expander",
            header: "",
            width: "40px",
            cell: (_value, row) =>
                row.kind === "base" && row.hasVariants ? (
                    <button
                        className={styles.expandButton}
                        onClick={() => toggleRow(row.product.id)}
                        aria-label={row.isExpanded ? "Comprimi" : "Espandi"}
                    >
                        {row.isExpanded ? <IconChevronDown size={20} /> : <IconChevronRight size={20} />}
                    </button>
                ) : (
                    <span className={styles.expanderSpacer} />
                )
        },
        {
            id: "name",
            header: "Nome",
            width: "2fr",
            accessor: row => row.product.name,
            cell: (_value, row) => (
                <div className={`${styles.colName} ${row.kind === "variant" ? styles.variantName : ""}`}>
                    <div className={styles.productNameRow}>
                        <Text variant="body-sm" weight={row.kind === "variant" ? 500 : 600}>
                            {row.product.name}
                        </Text>
                        {row.kind === "variant" && <Badge variant="secondary">Variante</Badge>}
                    </div>
                    {row.product.description && (
                        <Text variant="caption" colorVariant="muted">
                            {row.product.description}
                        </Text>
                    )}
                </div>
            )
        },
        {
            id: "price",
            header: "Prezzo Base",
            width: "1fr",
            accessor: row => row.product.base_price,
            cell: value =>
                value !== null ? (
                    <Text variant="body-sm">€{(value as number).toFixed(2)}</Text>
                ) : (
                    <Text variant="body-sm" colorVariant="muted">
                        —
                    </Text>
                )
        },
        {
            id: "visibility",
            header: "Visibilità",
            width: "1fr",
            accessor: row => row.product.is_visible,
            cell: value =>
                value !== false ? (
                    <Badge variant="success">Visibile</Badge>
                ) : (
                    <Badge variant="secondary">Nascosto</Badge>
                )
        },
        {
            id: "variants",
            header: "Varianti",
            width: "1fr",
            cell: (_value, row) =>
                row.kind === "base" ? (
                    row.hasVariants ? (
                        <Badge variant="primary">{row.visibleVariants.length} varianti</Badge>
                    ) : (
                        <Text variant="body-sm" colorVariant="muted">
                            —
                        </Text>
                    )
                ) : (
                    <Text variant="body-sm" colorVariant="muted">
                        —
                    </Text>
                )
        },
        {
            id: "actions",
            header: "",
            width: "60px",
            align: "right",
            cell: (_value, row) => (
                <div className={styles.colActions}>
                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                            <button className={styles.actionButton} aria-label="Azioni">
                                <IconDotsVertical size={16} />
                            </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                            <DropdownMenu.Content
                                className={styles.dropdownContent}
                                align="end"
                                sideOffset={4}
                            >
                                <DropdownMenu.Item
                                    className={styles.dropdownItem}
                                    onClick={() => handleEdit(row.product)}
                                >
                                    {row.kind === "base" ? "Modifica Prodotto" : "Modifica Variante"}
                                </DropdownMenu.Item>

                                {row.kind === "base" && (
                                    <DropdownMenu.Item
                                        className={styles.dropdownItem}
                                        onClick={() => handleCreateVariant(row.product)}
                                    >
                                        Aggiungi Variante
                                    </DropdownMenu.Item>
                                )}

                                <DropdownMenu.Separator className={styles.dropdownSeparator} />

                                <DropdownMenu.Item
                                    className={styles.dropdownItem}
                                    onClick={() => handleDuplicate(row.product)}
                                >
                                    Duplica
                                </DropdownMenu.Item>
                                <DropdownMenu.Item
                                    className={`${styles.dropdownItem} ${styles.danger}`}
                                    onClick={() => handleDelete(row.product)}
                                >
                                    {row.kind === "base" ? "Elimina" : "Elimina Variante"}
                                </DropdownMenu.Item>
                            </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                </div>
            )
        }
    ];

    return (
        <section className={styles.container}>
            <PageHeader
                title="Prodotti"
                subtitle="Gestisci il tuo catalogo prodotti, prezzi, varianti e raggruppamenti."
                actions={
                    activeTab === "products" ? (
                        <Button variant="primary" onClick={handleCreateBase}>
                            Crea prodotto
                        </Button>
                    ) : (
                        <Button variant="primary" onClick={() => setCreateGroupOpen(true)}>
                            Crea gruppo
                        </Button>
                    )
                }
            />

            <Tabs value={activeTab} onChange={val => setActiveTab(val as "products" | "groups")}>
                <Tabs.List>
                    <Tabs.Tab value="products">Prodotti</Tabs.Tab>
                    <Tabs.Tab value="groups">Gruppi Prodotti</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="products">
                    <div className={styles.content}>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "16px",
                                marginBottom: "24px",
                                flexWrap: "wrap"
                            }}
                        >
                            <FilterBar
                                search={{
                                    value: searchQuery,
                                    onChange: setSearchQuery,
                                    placeholder: "Cerca piatto o variante..."
                                }}
                                view={{
                                    value: density === "compact" ? "list" : "grid",
                                    onChange: v => setDensity(v === "list" ? "compact" : "extended")
                                }}
                                className={styles.filterBar}
                            />
                        </div>

                        <Card className={styles.tableCard}>
                            {isLoading ? (
                                <div className={styles.loadingState}>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Caricamento prodotti in corso...
                                    </Text>
                                </div>
                            ) : filteredProducts.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <IconPizza size={48} stroke={1} className={styles.emptyIcon} />
                                    <Text variant="title-sm" weight={600}>
                                        Nessun prodotto trovato
                                    </Text>
                                    <Text variant="body-sm" colorVariant="muted">
                                        {searchQuery || !showHidden
                                            ? "Nessun prodotto corrisponde ai filtri di ricerca."
                                            : "Non hai ancora aggiunto alcun prodotto base."}
                                    </Text>
                                    {!searchQuery && showHidden && (
                                        <Button
                                            variant="primary"
                                            onClick={handleCreateBase}
                                            className={styles.emptyButton}
                                        >
                                            Crea primo prodotto
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <DataTable<ProductTableRow>
                                    data={tableRows}
                                    columns={columns}
                                    density={density}
                                    rowClassName={row =>
                                        row.kind === "variant" ? styles.variantTableRow : undefined
                                    }
                                />
                            )}
                        </Card>
                    </div>

                    {/* Drawers */}
                    <ProductCreateEditDrawer
                        open={isCreateEditOpen}
                        onClose={() => setIsCreateEditOpen(false)}
                        mode={createEditMode}
                        productData={productToEdit}
                        parentProduct={parentForVariant}
                        onSuccess={loadData}
                        tenantId={currentTenantId}
                    />

                    <ProductDeleteDrawer
                        open={isDeleteOpen}
                        onClose={() => setIsDeleteOpen(false)}
                        productData={productToDelete}
                        onSuccess={loadData}
                    />
                </Tabs.Panel>
                <Tabs.Panel value="groups">
                    <ProductGroupsTab
                        tenantId={currentTenantId}
                        isCreateOpen={isCreateGroupOpen}
                        onCloseCreate={() => setCreateGroupOpen(false)}
                    />
                </Tabs.Panel>
            </Tabs>
        </section>
    );
}
