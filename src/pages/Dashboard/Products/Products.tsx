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
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { Link } from "react-router-dom";
import styles from "./Products.module.scss";

import {
    listBaseProductsWithVariants,
    V2Product,
    duplicateProduct,
    getProductListMetadata,
    ProductListMetadata
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

const EMPTY_PRODUCT_METADATA: ProductListMetadata = {
    formatsCount: 0,
    configurationsCount: 0,
    catalogsCount: 0,
    fromPrice: null
};

const formatCurrency = (value: number) => `${value.toFixed(2)} €`;

const getAllProductIds = (products: V2Product[]): string[] =>
    products.flatMap(product => [
        product.id,
        ...(product.variants?.map(variant => variant.id) ?? [])
    ]);

export default function Products() {
    const { user } = useAuth();
    const currentTenantId = user?.id;
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [allProducts, setAllProducts] = useState<V2Product[]>([]);
    const [productMetadata, setProductMetadata] = useState<Record<string, ProductListMetadata>>({});
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    const [activeTab, setActiveTab] = useState<"products" | "groups">("products");
    const [isCreateGroupOpen, setCreateGroupOpen] = useState(false);

    // Filter State
    const [searchQuery, setSearchQuery] = useState("");
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
            const productIds = getAllProductIds(data);

            try {
                const metadata = await getProductListMetadata(currentTenantId, productIds);
                setProductMetadata(metadata);
            } catch (metadataError) {
                console.error("Errore nel caricamento dei metadati prodotto:", metadataError);
                setProductMetadata({});
                showToast({
                    message: "Alcuni dati prodotto non sono disponibili al momento.",
                    type: "info"
                });
            }
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
                        <Link to={`/products/${row.product.id}`} className={styles.productLink}>
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
                const meta = productMetadata[row.product.id] ?? EMPTY_PRODUCT_METADATA;
                const hasFormats = meta.formatsCount > 0;

                if (hasFormats) {
                    const fromPrice = meta.fromPrice ?? row.product.base_price;
                    return fromPrice !== null ? (
                        <Text variant="body-sm">da {formatCurrency(fromPrice)}</Text>
                    ) : (
                        <Text variant="body-sm" colorVariant="muted">
                            —
                        </Text>
                    );
                }

                return row.product.base_price !== null ? (
                    <Text variant="body-sm">{formatCurrency(row.product.base_price)}</Text>
                ) : (
                    <Text variant="body-sm" colorVariant="muted">
                        —
                    </Text>
                );
            }
        },
        {
            id: "formats",
            header: "Formati",
            width: "1fr",
            accessor: row => row.product.id,
            cell: (_value, row) => {
                const formatsCount = (productMetadata[row.product.id] ?? EMPTY_PRODUCT_METADATA)
                    .formatsCount;

                return formatsCount > 0 ? (
                    <Text variant="body-sm">
                        {formatsCount} {formatsCount === 1 ? "formato" : "formati"}
                    </Text>
                ) : (
                    <Text variant="body-sm" colorVariant="muted">
                        —
                    </Text>
                );
            }
        },
        {
            id: "configurations",
            header: "Configurazioni",
            width: "1fr",
            accessor: row => row.product.id,
            cell: (_value, row) => {
                const configurationsCount = (
                    productMetadata[row.product.id] ?? EMPTY_PRODUCT_METADATA
                ).configurationsCount;

                return configurationsCount > 0 ? (
                    <Text variant="body-sm">
                        {configurationsCount} {configurationsCount === 1 ? "opzione" : "opzioni"}
                    </Text>
                ) : (
                    <Text variant="body-sm" colorVariant="muted">
                        —
                    </Text>
                );
            }
        },
        {
            id: "catalogs",
            header: "Cataloghi",
            width: "1fr",
            accessor: row => row.product.id,
            cell: (_value, row) => {
                const catalogsCount = (productMetadata[row.product.id] ?? EMPTY_PRODUCT_METADATA)
                    .catalogsCount;

                return catalogsCount > 0 ? (
                    <Text variant="body-sm">
                        {catalogsCount} {catalogsCount === 1 ? "catalogo" : "cataloghi"}
                    </Text>
                ) : (
                    <Text variant="body-sm" colorVariant="muted">
                        —
                    </Text>
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

                        {isLoading ? (
                            <div className={styles.loadingState}>
                                <Text variant="body-sm" colorVariant="muted">
                                    Caricamento prodotti in corso...
                                </Text>
                            </div>
                        ) : filteredProducts.length === 0 ? (
                            <div className={styles.emptyState}>
                                <Text variant="title-sm" weight={600}>
                                    Nessun prodotto trovato
                                </Text>
                                <Text variant="body-sm" colorVariant="muted">
                                    {searchQuery
                                        ? "Nessun prodotto corrisponde ai filtri di ricerca."
                                        : "Non hai ancora aggiunto alcun prodotto base."}
                                </Text>
                                {!searchQuery && (
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
