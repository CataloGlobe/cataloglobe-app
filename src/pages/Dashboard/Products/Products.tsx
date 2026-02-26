import React, { useEffect, useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { Card } from "@/components/ui/Card/Card";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import {
    IconPizza,
    IconDotsVertical,
    IconChevronDown,
    IconChevronRight,
    IconPlus
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
    const [showHidden, setShowHidden] = useState(false);
    const [density, setDensity] = useState<"compact" | "extended">("compact");

    // Drawer States
    const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
    const [createEditMode, setCreateEditMode] = useState<ProductFormMode>("create_base");
    const [productToEdit, setProductToEdit] = useState<V2Product | null>(null);
    const [parentForVariant, setParentForVariant] = useState<V2Product | null>(null);

    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState<V2Product | null>(null);

    const loadData = async () => {
        try {
            setIsLoading(true);
            const data = await listBaseProductsWithVariants(currentTenantId!);
            setAllProducts(data);
        } catch (error) {
            console.error("Errore nel caricamento dei prodotti:", error);
            showToast({ message: "Non è stato possibile caricare i prodotti.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (currentTenantId) {
            loadData();
        }
    }, [currentTenantId]);

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

    // Table mapping
    const containerClasses = [styles.listContainer];
    if (density === "extended") containerClasses.push(styles.densityExtended);

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
                                <div className={containerClasses.join(" ")}>
                                    <div className={styles.listHeader}>
                                        <div className={styles.colExpander}></div>
                                        <div className={styles.colName}>Nome</div>
                                        <div className={styles.colPrice}>Prezzo Base</div>
                                        <div className={styles.colVisibility}>Visibilità</div>
                                        <div className={styles.colVariants}>Varianti</div>
                                        <div className={styles.colActions}></div>
                                    </div>
                                    <div className={styles.listBody}>
                                        {filteredProducts.map(product => {
                                            const hasVariants =
                                                product.variants && product.variants.length > 0;
                                            const isExpanded = expandedRows.has(product.id);

                                            // Visible variants list according to toggle
                                            const visibleVariants =
                                                product.variants?.filter(
                                                    v => showHidden || v.is_visible !== false
                                                ) || [];

                                            return (
                                                <React.Fragment key={product.id}>
                                                    <div
                                                        className={`${styles.listRow} ${hasVariants ? styles.rowExpandable : ""} ${isExpanded ? styles.rowExpanded : ""}`}
                                                        onClick={() => {
                                                            if (hasVariants) toggleRow(product.id);
                                                        }}
                                                    >
                                                        <div className={styles.colExpander}>
                                                            {hasVariants && (
                                                                <button
                                                                    className={styles.expandButton}
                                                                    aria-label={
                                                                        isExpanded
                                                                            ? "Comprimi"
                                                                            : "Espandi"
                                                                    }
                                                                >
                                                                    {isExpanded ? (
                                                                        <IconChevronDown
                                                                            size={20}
                                                                        />
                                                                    ) : (
                                                                        <IconChevronRight
                                                                            size={20}
                                                                        />
                                                                    )}
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className={styles.colName}>
                                                            <div className={styles.productNameRow}>
                                                                <Text
                                                                    variant="body-sm"
                                                                    weight={600}
                                                                >
                                                                    {product.name}
                                                                </Text>
                                                            </div>
                                                            {product.description && (
                                                                <Text
                                                                    variant="caption"
                                                                    colorVariant="muted"
                                                                >
                                                                    {product.description}
                                                                </Text>
                                                            )}
                                                        </div>
                                                        <div className={styles.colPrice}>
                                                            {product.base_price !== null ? (
                                                                <Text variant="body-sm">
                                                                    €{product.base_price.toFixed(2)}
                                                                </Text>
                                                            ) : (
                                                                <Text
                                                                    variant="body-sm"
                                                                    colorVariant="muted"
                                                                >
                                                                    —
                                                                </Text>
                                                            )}
                                                        </div>
                                                        <div className={styles.colVisibility}>
                                                            {product.is_visible !== false ? (
                                                                <Badge variant="success">
                                                                    Visibile
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="secondary">
                                                                    Nascosto
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className={styles.colVariants}>
                                                            {hasVariants ? (
                                                                <Badge variant="primary">
                                                                    {visibleVariants.length}{" "}
                                                                    varianti
                                                                </Badge>
                                                            ) : (
                                                                <Text
                                                                    variant="body-sm"
                                                                    colorVariant="muted"
                                                                >
                                                                    —
                                                                </Text>
                                                            )}
                                                        </div>
                                                        <div
                                                            className={styles.colActions}
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            <DropdownMenu.Root>
                                                                <DropdownMenu.Trigger asChild>
                                                                    <button
                                                                        className={
                                                                            styles.actionButton
                                                                        }
                                                                        aria-label="Azioni"
                                                                    >
                                                                        <IconDotsVertical
                                                                            size={16}
                                                                        />
                                                                    </button>
                                                                </DropdownMenu.Trigger>
                                                                <DropdownMenu.Portal>
                                                                    <DropdownMenu.Content
                                                                        className={
                                                                            styles.dropdownContent
                                                                        }
                                                                        align="end"
                                                                        sideOffset={4}
                                                                    >
                                                                        <DropdownMenu.Item
                                                                            className={
                                                                                styles.dropdownItem
                                                                            }
                                                                            onClick={() =>
                                                                                handleEdit(product)
                                                                            }
                                                                        >
                                                                            Modifica Prodotto
                                                                        </DropdownMenu.Item>
                                                                        <DropdownMenu.Item
                                                                            className={
                                                                                styles.dropdownItem
                                                                            }
                                                                            onClick={() =>
                                                                                handleCreateVariant(
                                                                                    product
                                                                                )
                                                                            }
                                                                        >
                                                                            Aggiungi Variante
                                                                        </DropdownMenu.Item>
                                                                        <DropdownMenu.Separator
                                                                            className={
                                                                                styles.dropdownSeparator
                                                                            }
                                                                        />
                                                                        <DropdownMenu.Item
                                                                            className={
                                                                                styles.dropdownItem
                                                                            }
                                                                            onClick={() =>
                                                                                handleDuplicate(
                                                                                    product
                                                                                )
                                                                            }
                                                                        >
                                                                            Duplica
                                                                        </DropdownMenu.Item>
                                                                        <DropdownMenu.Item
                                                                            className={`${styles.dropdownItem} ${styles.danger}`}
                                                                            onClick={() =>
                                                                                handleDelete(
                                                                                    product
                                                                                )
                                                                            }
                                                                        >
                                                                            Elimina
                                                                        </DropdownMenu.Item>
                                                                    </DropdownMenu.Content>
                                                                </DropdownMenu.Portal>
                                                            </DropdownMenu.Root>
                                                        </div>
                                                    </div>

                                                    {/* Sub-rows for Variants */}
                                                    {isExpanded &&
                                                        visibleVariants.map(variant => (
                                                            <div
                                                                key={variant.id}
                                                                className={styles.listRowVariant}
                                                            >
                                                                <div className={styles.colName}>
                                                                    <div
                                                                        className={
                                                                            styles.productNameRow
                                                                        }
                                                                    >
                                                                        <Text
                                                                            variant="body-sm"
                                                                            weight={500}
                                                                        >
                                                                            {variant.name}
                                                                        </Text>
                                                                        <Badge variant="secondary">
                                                                            Variante
                                                                        </Badge>
                                                                    </div>
                                                                    {variant.description && (
                                                                        <Text
                                                                            variant="caption"
                                                                            colorVariant="muted"
                                                                        >
                                                                            {variant.description}
                                                                        </Text>
                                                                    )}
                                                                </div>
                                                                <div className={styles.colPrice}>
                                                                    {variant.base_price !== null ? (
                                                                        <Text variant="body-sm">
                                                                            €
                                                                            {variant.base_price.toFixed(
                                                                                2
                                                                            )}
                                                                        </Text>
                                                                    ) : (
                                                                        <Text
                                                                            variant="body-sm"
                                                                            colorVariant="muted"
                                                                        >
                                                                            —
                                                                        </Text>
                                                                    )}
                                                                </div>
                                                                <div
                                                                    className={styles.colVisibility}
                                                                >
                                                                    {variant.is_visible !==
                                                                    false ? (
                                                                        <Badge variant="success">
                                                                            Visibile
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge variant="secondary">
                                                                            Nascosto
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                <div
                                                                    className={styles.colVariants}
                                                                ></div>
                                                                <div className={styles.colActions}>
                                                                    <DropdownMenu.Root>
                                                                        <DropdownMenu.Trigger
                                                                            asChild
                                                                        >
                                                                            <button
                                                                                className={
                                                                                    styles.actionButton
                                                                                }
                                                                                aria-label="Azioni"
                                                                            >
                                                                                <IconDotsVertical
                                                                                    size={16}
                                                                                />
                                                                            </button>
                                                                        </DropdownMenu.Trigger>
                                                                        <DropdownMenu.Portal>
                                                                            <DropdownMenu.Content
                                                                                className={
                                                                                    styles.dropdownContent
                                                                                }
                                                                                align="end"
                                                                                sideOffset={4}
                                                                            >
                                                                                <DropdownMenu.Item
                                                                                    className={
                                                                                        styles.dropdownItem
                                                                                    }
                                                                                    onClick={() =>
                                                                                        handleEdit(
                                                                                            variant
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    Modifica
                                                                                    Variante
                                                                                </DropdownMenu.Item>
                                                                                <DropdownMenu.Separator
                                                                                    className={
                                                                                        styles.dropdownSeparator
                                                                                    }
                                                                                />
                                                                                <DropdownMenu.Item
                                                                                    className={
                                                                                        styles.dropdownItem
                                                                                    }
                                                                                    onClick={() =>
                                                                                        handleDuplicate(
                                                                                            variant
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    Duplica
                                                                                </DropdownMenu.Item>
                                                                                <DropdownMenu.Item
                                                                                    className={`${styles.dropdownItem} ${styles.danger}`}
                                                                                    onClick={() =>
                                                                                        handleDelete(
                                                                                            variant
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    Elimina Variante
                                                                                </DropdownMenu.Item>
                                                                            </DropdownMenu.Content>
                                                                        </DropdownMenu.Portal>
                                                                    </DropdownMenu.Root>
                                                                </div>
                                                            </div>
                                                        ))}
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>
                                </div>
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
