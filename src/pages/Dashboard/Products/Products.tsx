import { useCallback, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { Package } from "lucide-react";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { Link } from "react-router-dom";
import ProductCard from "./components/ProductCard";
import ProductCardGroup from "./components/ProductCardGroup";
import styles from "./Products.module.scss";

import {
    listBaseProductsWithVariants,
    V2Product,
    duplicateProduct,
    deleteProduct,
    getProductListMetadata,
    ProductListMetadata
} from "@/services/supabase/products";

import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ProductCreateEditDrawer, ProductFormMode } from "./ProductCreateEditDrawer";
import { ProductDeleteDrawer } from "./ProductDeleteDrawer";
import ProductGroupsTab from "@/components/Products/ProductGroupsTab/ProductGroupsTab";
import { ProductsAttributesTab } from "./ProductsAttributesTab";
import { Ingredients } from "./Ingredients/Ingredients";

type ProductTableRow = {
    id: string; // Add id for DataTable selection
    kind: "base" | "variant";
    product: V2Product;
    parent?: V2Product;
    hasVariants: boolean;
    visibleVariants: V2Product[];
    isExpanded: boolean;
};

const EMPTY_PRODUCT_METADATA: ProductListMetadata = {
    formatsCount: 0,
    configurationsCount: 0,
    catalogsCount: 0,
    fromPrice: null
};

const formatCurrency = (value: number) => `${value.toFixed(2)} €`;

export default function Products() {
    const currentTenantId = useTenantId();
    const { selectedTenant } = useTenant();
    const { showToast } = useToast();
    const verticalConfig = useVerticalConfig();

    const [isLoading, setIsLoading] = useState(true);
    const [allProducts, setAllProducts] = useState<V2Product[]>([]);
    const [productMetadata, setProductMetadata] = useState<Record<string, ProductListMetadata>>({});
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    const [searchParams] = useSearchParams();
    const initialTab = (searchParams.get("tab") ?? "products") as
        | "products"
        | "groups"
        | "attributes"
        | "ingredients";
    const [activeTab, setActiveTab] = useState<"products" | "groups" | "attributes" | "ingredients">(
        ["products", "groups", "attributes", "ingredients"].includes(initialTab)
            ? initialTab
            : "products"
    );
    const [isCreateGroupOpen, setCreateGroupOpen] = useState(false);
    const [attrCreateSeq, setAttrCreateSeq] = useState(0);
    const [ingredientCreateSeq, setIngredientCreateSeq] = useState(0);

    // Filter State
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
        const saved = localStorage.getItem("products_view_mode");
        return saved === "grid" ? "grid" : "list";
    });

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
            const baseProductIds = data.map(p => p.id);
            const variantIds = data.flatMap(p => p.variants?.map(v => v.id) ?? []);

            try {
                const metadata = await getProductListMetadata(currentTenantId, [...baseProductIds, ...variantIds]);
                setProductMetadata(metadata);
            } catch {
                setProductMetadata({});
                showToast({
                    message: "Alcuni dati prodotto non sono disponibili al momento.",
                    type: "info"
                });
            }
        } catch {
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
            // Search filter
            if (searchQuery && !product.name.toLowerCase().includes(searchQuery.toLowerCase())) {
                // Check if any variant matches
                const variantsMatch = product.variants?.some(v =>
                    v.name.toLowerCase().includes(searchQuery.toLowerCase())
                );
                if (!variantsMatch) return false;
            }
            return true;
        });
    }, [allProducts, searchQuery]);

    const tableRows = useMemo<ProductTableRow[]>(() => {
        const rows: ProductTableRow[] = [];

        filteredProducts.forEach(product => {
            const hasVariants = Boolean(product.variants?.length);
            const isExpanded = expandedRows.has(product.id);
            const visibleVariants = product.variants || [];

            rows.push({
                id: product.id,
                kind: "base",
                product,
                hasVariants,
                visibleVariants,
                isExpanded
            });

            if (isExpanded) {
                visibleVariants.forEach(variant => {
                    rows.push({
                        id: variant.id,
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
    }, [filteredProducts, expandedRows]);

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
        } catch {
            showToast({ message: "Errore durante la duplicazione del prodotto.", type: "error" });
        }
    };

    const handleDelete = (product: V2Product) => {
        setProductToDelete(product);
        setIsDeleteOpen(true);
    };

    const handleBulkDelete = async (selectedIds: string[]) => {
        if (!currentTenantId || selectedIds.length === 0) return;
        try {
            await Promise.all(selectedIds.map(id => deleteProduct(id, currentTenantId)));
            showToast({
                message: `${selectedIds.length} prodotti eliminati con successo.`,
                type: "success"
            });
            loadData();
        } catch {
            showToast({
                message: "Errore durante l'eliminazione di alcuni prodotti.",
                type: "error"
            });
        }
    };

    const handleViewChange = (v: "list" | "grid") => {
        setViewMode(v);
        localStorage.setItem("products_view_mode", v);
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
            id: "name",
            header: "Nome",
            width: "2fr",
            accessor: row => row.product.name,
            cell: (_value, row) => (
                <div
                    className={`${styles.colName} ${
                        row.kind === "variant" ? styles.variantName : ""
                    }`}
                >
                    <div className={styles.productNameRow}>
                        {row.kind === "base" && row.hasVariants && (
                            <button
                                className={styles.expandButton}
                                onClick={() => toggleRow(row.product.id)}
                                aria-label={row.isExpanded ? "Comprimi" : "Espandi"}
                            >
                                {row.isExpanded ? (
                                    <IconChevronDown size={20} />
                                ) : (
                                    <IconChevronRight size={20} />
                                )}
                            </button>
                        )}
                        <Link
                            to={`/business/${currentTenantId}/products/${row.product.id}`}
                            className={styles.productLink}
                        >
                            <Text
                                variant="body-sm"
                                weight={row.kind === "variant" ? 500 : 600}
                                className={styles.productLinkText}
                            >
                                {row.product.name}
                            </Text>
                        </Link>
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
            header: "Prezzo",
            width: "1fr",
            accessor: row => row.product.id,
            cell: (_value, row) => {
                if (row.kind === "variant") {
                    const variantMeta = productMetadata[row.product.id] ?? EMPTY_PRODUCT_METADATA;
                    // Variant has formats
                    if (variantMeta.formatsCount > 0 && variantMeta.fromPrice !== null) {
                        return variantMeta.formatsCount > 1 ? (
                            <Text variant="body-sm">da {formatCurrency(variantMeta.fromPrice)}</Text>
                        ) : (
                            <Text variant="body-sm">{formatCurrency(variantMeta.fromPrice)}</Text>
                        );
                    }
                    // Variant has own price
                    if (row.product.base_price !== null) {
                        return <Text variant="body-sm">{formatCurrency(row.product.base_price)}</Text>;
                    }
                    // Inherit: show parent's effective price
                    const parentMeta = row.parent
                        ? (productMetadata[row.parent.id] ?? EMPTY_PRODUCT_METADATA)
                        : EMPTY_PRODUCT_METADATA;
                    const inheritedPrice = parentMeta.fromPrice ?? row.parent?.base_price ?? null;
                    return inheritedPrice !== null ? (
                        <Text variant="body-sm" colorVariant="muted">
                            {formatCurrency(inheritedPrice)} (ereditato)
                        </Text>
                    ) : (
                        <Text variant="body-sm" colorVariant="muted">Eredita</Text>
                    );
                }

                // Base product
                const meta = productMetadata[row.product.id] ?? EMPTY_PRODUCT_METADATA;
                if (meta.formatsCount > 1) {
                    return meta.fromPrice !== null ? (
                        <Text variant="body-sm">da {formatCurrency(meta.fromPrice)}</Text>
                    ) : (
                        <Text variant="body-sm" colorVariant="muted">—</Text>
                    );
                }
                if (meta.formatsCount === 1 && meta.fromPrice !== null) {
                    return <Text variant="body-sm">{formatCurrency(meta.fromPrice)}</Text>;
                }
                return row.product.base_price !== null ? (
                    <Text variant="body-sm">{formatCurrency(row.product.base_price)}</Text>
                ) : (
                    <Text variant="body-sm" colorVariant="muted">—</Text>
                );
            }
        },
        {
            id: "actions",
            header: "Azioni",
            width: "96px",
            align: "right",
            cell: (_value, row) => (
                <TableRowActions
                    actions={[
                        {
                            label: row.kind === "base" ? "Modifica Prodotto" : "Modifica Variante",
                            onClick: () => handleEdit(row.product)
                        },
                        {
                            label: "Aggiungi Variante",
                            onClick: () => handleCreateVariant(row.product),
                            hidden: row.kind !== "base"
                        },
                        {
                            label: "Duplica",
                            onClick: () => handleDuplicate(row.product),
                            separator: true
                        },
                        {
                            label: row.kind === "base" ? "Elimina" : "Elimina Variante",
                            onClick: () => handleDelete(row.product),
                            variant: "destructive"
                        }
                    ]}
                />
            )
        }
    ];

    return (
        <section className={styles.container}>
            <PageHeader
                title={verticalConfig.productLabelPlural}
                businessName={selectedTenant?.name}
                subtitle={`Gestisci il tuo catalogo ${verticalConfig.productLabelPlural.toLowerCase()}, prezzi, varianti e raggruppamenti.`}
                actions={
                    activeTab === "products" ? (
                        <Button variant="primary" onClick={handleCreateBase}>
                            {`Crea ${verticalConfig.productLabel.toLowerCase()}`}
                        </Button>
                    ) : activeTab === "groups" ? (
                        <Button variant="primary" onClick={() => setCreateGroupOpen(true)}>
                            Crea gruppo
                        </Button>
                    ) : activeTab === "attributes" ? (
                        <Button variant="primary" onClick={() => setAttrCreateSeq(s => s + 1)}>
                            Nuovo attributo
                        </Button>
                    ) : activeTab === "ingredients" && verticalConfig.hasIngredients ? (
                        <Button variant="primary" onClick={() => setIngredientCreateSeq(s => s + 1)}>
                            Crea ingrediente
                        </Button>
                    ) : null
                }
            />

            <Tabs
                value={activeTab}
                onChange={val =>
                    setActiveTab(val as "products" | "groups" | "attributes" | "ingredients")
                }
            >
                <Tabs.List>
                    <Tabs.Tab value="products">{verticalConfig.productLabelPlural}</Tabs.Tab>
                    <Tabs.Tab value="groups">Gruppi Prodotti</Tabs.Tab>
                    <Tabs.Tab value="attributes">Attributi</Tabs.Tab>
                    {verticalConfig.hasIngredients && (
                        <Tabs.Tab value="ingredients">Ingredienti</Tabs.Tab>
                    )}
                </Tabs.List>

                <Tabs.Panel value="products">
                    <div className={styles.content}>
                        <div className={styles.filterRow}>
                            <FilterBar
                                search={{
                                    value: searchQuery,
                                    onChange: setSearchQuery,
                                    placeholder: `Cerca ${verticalConfig.productLabel.toLowerCase()} o variante...`
                                }}
                                view={{
                                    value: viewMode,
                                    onChange: handleViewChange
                                }}
                                className={styles.filterBar}
                            />
                        </div>

                        {isLoading ? (
                            <div className={styles.loadingState}>
                                <Text variant="body-sm" colorVariant="muted">
                                    Caricamento prodotti in corso...
                                </Text>
                            </div>
                        ) : filteredProducts.length === 0 ? (
                            <EmptyState
                                icon={<Package size={40} strokeWidth={1.5} />}
                                title={
                                    searchQuery
                                        ? `Nessun ${verticalConfig.productLabel.toLowerCase()} trovato`
                                        : `Non hai ancora creato ${verticalConfig.productLabelPlural.toLowerCase()}`
                                }
                                description={
                                    searchQuery
                                        ? `Nessun ${verticalConfig.productLabel.toLowerCase()} corrisponde ai filtri di ricerca.`
                                        : `I ${verticalConfig.productLabelPlural.toLowerCase()} sono gli elementi che compariranno nei tuoi cataloghi.`
                                }
                                action={
                                    !searchQuery ? (
                                        <Button variant="primary" onClick={handleCreateBase}>
                                            {`+ Crea il tuo primo ${verticalConfig.productLabel.toLowerCase()}`}
                                        </Button>
                                    ) : undefined
                                }
                            />
                        ) : viewMode === "list" ? (
                            <DataTable<ProductTableRow>
                                data={tableRows}
                                columns={columns}
                                density="compact"
                                selectable
                                onBulkDelete={handleBulkDelete}
                                rowClassName={row =>
                                    row.kind === "variant" ? styles.variantTableRow : undefined
                                }
                            />
                        ) : (
                            <div className={styles.productGrid}>
                                {filteredProducts.map(product => {
                                    const variants = product.variants ?? [];
                                    if (variants.length > 0) {
                                        return (
                                            <ProductCardGroup
                                                key={product.id}
                                                product={product}
                                                variants={variants}
                                                metadata={productMetadata}
                                                onEdit={handleEdit}
                                                onDelete={handleDelete}
                                            />
                                        );
                                    }
                                    return (
                                        <ProductCard
                                            key={product.id}
                                            product={product}
                                            metadata={
                                                productMetadata[product.id] ??
                                                EMPTY_PRODUCT_METADATA
                                            }
                                            onEdit={() => handleEdit(product)}
                                            onDelete={() => handleDelete(product)}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Drawers */}
                    <ProductCreateEditDrawer
                        open={isCreateEditOpen}
                        onClose={() => setIsCreateEditOpen(false)}
                        mode={createEditMode}
                        productData={productToEdit}
                        parentProduct={parentForVariant}
                        onSuccess={loadData}
                        tenantId={currentTenantId ?? undefined}
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
                        tenantId={currentTenantId ?? undefined}
                        isCreateOpen={isCreateGroupOpen}
                        onCloseCreate={() => setCreateGroupOpen(false)}
                    />
                </Tabs.Panel>
                <Tabs.Panel value="attributes">
                    <ProductsAttributesTab
                        tenantId={currentTenantId ?? undefined}
                        vertical={selectedTenant?.vertical_type}
                        createTrigger={attrCreateSeq}
                    />
                </Tabs.Panel>
                {verticalConfig.hasIngredients && (
                    <Tabs.Panel value="ingredients">
                        <Ingredients createTrigger={ingredientCreateSeq} />
                    </Tabs.Panel>
                )}
            </Tabs>
        </section>
    );
}
