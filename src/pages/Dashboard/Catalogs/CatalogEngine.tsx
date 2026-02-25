import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import {
    IconChevronLeft,
    IconPlus,
    IconFolder,
    IconPizza,
    IconTrash,
    IconEdit,
    IconArrowUp,
    IconArrowDown
} from "@tabler/icons-react";
import {
    listCategories,
    listCategoryProducts,
    createCategory,
    updateCategory,
    deleteCategory,
    addProductToCategory,
    removeProductFromCategory,
    updateProductSortOrder,
    V2Catalog,
    V2CatalogCategory,
    V2CatalogCategoryProduct
} from "@/services/supabase/v2/catalogs";
import { listBaseProductsWithVariants, V2Product } from "@/services/supabase/v2/products";
import { supabase } from "@/services/supabase/client";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import styles from "./Catalogs.module.scss";

// --- TREE NODE DEFINITION ---
type CategoryNode = V2CatalogCategory & {
    children: CategoryNode[];
    products: (V2CatalogCategoryProduct & { productDetails?: V2Product })[];
};

export default function CatalogEngine() {
    const { id: catalogId } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const currentTenantId = user?.id;
    const { showToast } = useToast();

    // Data state
    const [catalog, setCatalog] = useState<V2Catalog | null>(null);
    const [categories, setCategories] = useState<V2CatalogCategory[]>([]);
    const [categoryProducts, setCategoryProducts] = useState<V2CatalogCategoryProduct[]>([]);
    const [allProducts, setAllProducts] = useState<V2Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Tree State
    const [tree, setTree] = useState<CategoryNode[]>([]);

    // Category Drawer
    const [isCategoryDrawerOpen, setIsCategoryDrawerOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<V2CatalogCategory | null>(null);
    const [parentCategory, setParentCategory] = useState<V2CatalogCategory | null>(null);
    const [categoryName, setCategoryName] = useState("");
    const [isSavingCategory, setIsSavingCategory] = useState(false);

    // Delete Category Confirm
    const [categoryToDelete, setCategoryToDelete] = useState<V2CatalogCategory | null>(null);
    const [isDeletingCategory, setIsDeletingCategory] = useState(false);

    // Product Assignment Drawer
    const [isProductDrawerOpen, setIsProductDrawerOpen] = useState(false);
    const [targetCategoryForProduct, setTargetCategoryForProduct] =
        useState<V2CatalogCategory | null>(null);
    const [productSearch, setProductSearch] = useState("");
    const [isAssigningProduct, setIsAssigningProduct] = useState(false);

    const loadData = async () => {
        if (!currentTenantId || !catalogId) return;
        setIsLoading(true);
        try {
            // Fetch catalog details
            const { data: catData, error: catErr } = await supabase
                .from("v2_catalogs")
                .select("*")
                .eq("id", catalogId)
                .eq("tenant_id", currentTenantId)
                .single();
            if (catErr) throw catErr;
            setCatalog(catData);

            // Fetch categories
            const cats = await listCategories(currentTenantId, catalogId);
            setCategories(cats);

            // Fetch product assignments
            const catProds = await listCategoryProducts(currentTenantId, catalogId);
            setCategoryProducts(catProds);

            // Fetch all products (to display names and for selection)
            const prods = await listBaseProductsWithVariants(currentTenantId);
            setAllProducts(prods);
        } catch (error) {
            console.error(error);
            showToast({ message: "Errore durante il caricamento del catalogo.", type: "error" });
            navigate("/dashboard/cataloghi");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [currentTenantId, catalogId]);

    // Build the tree whenever data changes
    useEffect(() => {
        if (!categories.length && !categoryProducts.length) {
            setTree([]);
            return;
        }

        // 1. Create a map of nodes
        const nodeMap = new Map<string, CategoryNode>();
        categories.forEach(c => {
            nodeMap.set(c.id, { ...c, children: [], products: [] });
        });

        // 2. Attach products to nodes
        categoryProducts.forEach(cp => {
            const node = nodeMap.get(cp.category_id);
            if (node) {
                // Find product details
                let productDetails = allProducts.find(p => p.id === cp.product_id);
                if (!productDetails) {
                    // Try looking in variants
                    for (const base of allProducts) {
                        const variant = base.variants?.find(v => v.id === cp.product_id);
                        if (variant) {
                            productDetails = variant as V2Product; // Cast for simplicity here
                            break;
                        }
                    }
                }
                node.products.push({ ...cp, productDetails });
            }
        });

        // 3. Sort products within nodes
        nodeMap.forEach(node => {
            node.products.sort((a, b) => a.sort_order - b.sort_order);
        });

        // 4. Build hierarchy
        const rootNodes: CategoryNode[] = [];
        nodeMap.forEach(node => {
            if (node.parent_category_id) {
                const parent = nodeMap.get(node.parent_category_id);
                if (parent) {
                    parent.children.push(node);
                } else {
                    rootNodes.push(node); // Fallback if parent is missing
                }
            } else {
                rootNodes.push(node);
            }
        });

        // 5. Sort children
        const sortNodes = (nodes: CategoryNode[]) => {
            nodes.sort((a, b) => a.sort_order - b.sort_order);
            nodes.forEach(n => sortNodes(n.children));
        };
        sortNodes(rootNodes);

        setTree(rootNodes);
    }, [categories, categoryProducts, allProducts]);

    // --- CATEGORY HANDLERS ---
    const handleAddRootCategory = () => {
        setParentCategory(null);
        setEditingCategory(null);
        setCategoryName("");
        setIsCategoryDrawerOpen(true);
    };

    const handleAddSubCategory = (parent: V2CatalogCategory) => {
        if (parent.level >= 3) {
            showToast({ message: "Non puoi creare categorie oltre il livello 3.", type: "error" });
            return;
        }
        setParentCategory(parent);
        setEditingCategory(null);
        setCategoryName("");
        setIsCategoryDrawerOpen(true);
    };

    const handleEditCategory = (category: V2CatalogCategory) => {
        setEditingCategory(category);
        setParentCategory(categories.find(c => c.id === category.parent_category_id) || null);
        setCategoryName(category.name);
        setIsCategoryDrawerOpen(true);
    };

    const handleSaveCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentTenantId || !catalogId) return;
        if (!categoryName.trim()) {
            showToast({ message: "Il nome della categoria è obbligatorio.", type: "error" });
            return;
        }

        setIsSavingCategory(true);
        try {
            if (editingCategory) {
                await updateCategory(editingCategory.id, currentTenantId, { name: categoryName });
                showToast({ message: "Categoria aggiornata.", type: "success" });
            } else {
                const targetLevel = parentCategory ? ((parentCategory.level + 1) as 1 | 2 | 3) : 1;
                // Calculate max sort order among siblings
                const siblings = categories.filter(
                    c => c.parent_category_id === (parentCategory?.id || null)
                );
                const nextSortOrder =
                    siblings.length > 0 ? Math.max(...siblings.map(s => s.sort_order)) + 10 : 0;

                await createCategory(
                    currentTenantId,
                    catalogId,
                    categoryName,
                    targetLevel,
                    parentCategory?.id || null,
                    nextSortOrder
                );
                showToast({ message: "Categoria creata.", type: "success" });
            }
            setIsCategoryDrawerOpen(false);
            loadData();
        } catch (error: any) {
            console.error(error);
            showToast({ message: error.message || "Errore salvataggio categoria.", type: "error" });
        } finally {
            setIsSavingCategory(false);
        }
    };

    const handleDeleteCategory = async () => {
        if (!currentTenantId || !categoryToDelete) return;
        setIsDeletingCategory(true);
        try {
            await deleteCategory(categoryToDelete.id, currentTenantId);
            showToast({ message: "Categoria e sotto-categorie eliminate.", type: "success" });
            setCategoryToDelete(null);
            loadData();
        } catch (error) {
            console.error(error);
            showToast({ message: "Errore durante l'eliminazione.", type: "error" });
        } finally {
            setIsDeletingCategory(false);
        }
    };

    const moveCategory = async (category: V2CatalogCategory, direction: "up" | "down") => {
        if (!currentTenantId) return;
        const siblings = categories
            .filter(c => c.parent_category_id === category.parent_category_id)
            .sort((a, b) => a.sort_order - b.sort_order);

        const index = siblings.findIndex(s => s.id === category.id);
        if (index === -1) return;

        if (direction === "up" && index > 0) {
            const prev = siblings[index - 1];
            // Swap sort orders
            const tempOrder = prev.sort_order;
            await updateCategory(category.id, currentTenantId, { sort_order: prev.sort_order });
            await updateCategory(prev.id, currentTenantId, { sort_order: category.sort_order });
            loadData();
        } else if (direction === "down" && index < siblings.length - 1) {
            const next = siblings[index + 1];
            await updateCategory(category.id, currentTenantId, { sort_order: next.sort_order });
            await updateCategory(next.id, currentTenantId, { sort_order: category.sort_order });
            loadData();
        }
    };

    const moveProduct = async (
        link: V2CatalogCategoryProduct,
        direction: "up" | "down",
        siblings: V2CatalogCategoryProduct[]
    ) => {
        if (!currentTenantId) return;

        const index = siblings.findIndex(s => s.id === link.id);
        if (index === -1) return;

        if (direction === "up" && index > 0) {
            const prev = siblings[index - 1];
            await updateProductSortOrder(link.id, currentTenantId, prev.sort_order);
            await updateProductSortOrder(prev.id, currentTenantId, link.sort_order);
            loadData();
        } else if (direction === "down" && index < siblings.length - 1) {
            const next = siblings[index + 1];
            await updateProductSortOrder(link.id, currentTenantId, next.sort_order);
            await updateProductSortOrder(next.id, currentTenantId, link.sort_order);
            loadData();
        }
    };

    // --- PRODUCT HANDLERS ---
    const handleOpenProductDrawer = (category: V2CatalogCategory) => {
        setTargetCategoryForProduct(category);
        setProductSearch("");
        setIsProductDrawerOpen(true);
    };

    const handleAddProduct = async (productId: string) => {
        if (!currentTenantId || !catalogId || !targetCategoryForProduct) return;
        setIsAssigningProduct(true);
        try {
            // Find max sort order in target category
            const existingLinks = categoryProducts.filter(
                cp => cp.category_id === targetCategoryForProduct.id
            );
            const nextSort =
                existingLinks.length > 0
                    ? Math.max(...existingLinks.map(l => l.sort_order)) + 10
                    : 0;

            await addProductToCategory(
                currentTenantId,
                catalogId,
                targetCategoryForProduct.id,
                productId,
                nextSort
            );
            showToast({ message: "Prodotto aggiunto alla categoria.", type: "success" });
            setIsProductDrawerOpen(false); // Can keep open if user wants to add multiple, but UX preference is usually close or feedback
            loadData();
        } catch (error: any) {
            console.error(error);
            showToast({
                message: error.message || "Impossibile aggiungere il prodotto.",
                type: "error"
            });
        } finally {
            setIsAssigningProduct(false);
        }
    };

    const handleRemoveProduct = async (linkId: string) => {
        if (!currentTenantId) return;
        try {
            await removeProductFromCategory(currentTenantId, linkId);
            showToast({ message: "Prodotto rimosso.", type: "success" });
            loadData();
        } catch (error) {
            console.error(error);
            showToast({ message: "Errore durante la rimozione.", type: "error" });
        }
    };

    // Render Recursive Tree Node
    const renderNode = (node: CategoryNode) => {
        return (
            <div
                key={node.id}
                className={styles.categoryNode}
                style={{ marginTop: node.level > 1 ? "12px" : "0" }}
            >
                <div className={styles.categoryHeader}>
                    <div className={styles.categoryTitle}>
                        <IconFolder size={18} color="var(--color-gray-500)" />
                        <Text variant="body" weight={600}>
                            {node.name}
                        </Text>
                        <span className={`${styles.levelBadge} ${styles[`level${node.level}`]}`}>
                            L{node.level}
                        </span>
                    </div>
                    <div className={styles.categoryActions}>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveCategory(node, "up")}
                            aria-label="Sposta su"
                        >
                            <IconArrowUp size={16} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveCategory(node, "down")}
                            aria-label="Sposta giù"
                        >
                            <IconArrowDown size={16} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditCategory(node)}
                            aria-label="Modifica"
                        >
                            <IconEdit size={16} />
                        </Button>
                        {node.level < 3 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAddSubCategory(node)}
                                aria-label="Aggiungi sotto-categoria"
                                style={{ color: "var(--color-primary-600)" }}
                            >
                                <IconPlus size={16} /> Sub
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenProductDrawer(node)}
                            aria-label="Aggiungi prodotto"
                            style={{ color: "var(--color-green-600)" }}
                        >
                            <IconPizza size={16} /> Prod
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCategoryToDelete(node)}
                            aria-label="Elimina"
                            style={{ color: "var(--color-red-600)" }}
                        >
                            <IconTrash size={16} />
                        </Button>
                    </div>
                </div>

                {(node.children.length > 0 || node.products.length > 0) && (
                    <div className={styles.categoryChildren}>
                        {/* Products under this category */}
                        {node.products.length > 0 && (
                            <div className={styles.productList}>
                                {node.products.map(link => (
                                    <div key={link.id} className={styles.productRow}>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "8px"
                                            }}
                                        >
                                            <IconPizza size={16} color="var(--color-gray-400)" />
                                            <Text variant="body-sm">
                                                {link.productDetails?.name ||
                                                    "Prodotto sconosciuto"}
                                            </Text>
                                        </div>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "4px"
                                            }}
                                        >
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    moveProduct(link, "up", node.products)
                                                }
                                                aria-label="Sposta su"
                                            >
                                                <IconArrowUp size={14} />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    moveProduct(link, "down", node.products)
                                                }
                                                aria-label="Sposta giù"
                                            >
                                                <IconArrowDown size={14} />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveProduct(link.id)}
                                                aria-label="Rimuovi"
                                                style={{ color: "var(--color-red-600)" }}
                                            >
                                                <IconTrash size={14} />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Sub-categories */}
                        {node.children.map(child => renderNode(child))}
                    </div>
                )}
            </div>
        );
    };

    // Filter products for the drawer
    const filteredProductsForDrawer = allProducts.flatMap(p => {
        const matches = [];
        if (p.name.toLowerCase().includes(productSearch.toLowerCase())) {
            matches.push(p);
        }
        if (p.variants) {
            p.variants.forEach(v => {
                if (v.name.toLowerCase().includes(productSearch.toLowerCase())) {
                    matches.push(v as V2Product);
                }
            });
        }
        return matches;
    });

    return (
        <section className={styles.container}>
            <PageHeader
                title={catalog?.name || "Caricamento catalogo..."}
                subtitle="Configura la struttura delle categorie e aggiungi i prodotti."
                actions={
                    <div style={{ display: "flex", gap: "8px" }}>
                        <Button
                            variant="secondary"
                            onClick={() => navigate("/dashboard/cataloghi")}
                        >
                            <IconChevronLeft size={20} /> Torna ai Cataloghi
                        </Button>
                        <Button variant="primary" onClick={handleAddRootCategory}>
                            <IconPlus size={20} /> Categoria Principale
                        </Button>
                    </div>
                }
            />

            <div className={styles.content}>
                {isLoading ? (
                    <Card className={styles.catalogsCard}>
                        <div className={styles.loadingState}>
                            <Text variant="body-sm" colorVariant="muted">
                                Costruzione albero in corso...
                            </Text>
                        </div>
                    </Card>
                ) : tree.length === 0 ? (
                    <Card className={styles.catalogsCard}>
                        <div className={styles.emptyState}>
                            <IconFolder size={48} stroke={1} className={styles.emptyIcon} />
                            <Text variant="title-sm" weight={600}>
                                Catalogo Vuoto
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                Inizia creando la tua prima categoria principale.
                            </Text>
                            <Button
                                variant="primary"
                                onClick={handleAddRootCategory}
                                className={styles.emptyButton}
                            >
                                Crea categoria
                            </Button>
                        </div>
                    </Card>
                ) : (
                    <div className={styles.treeContainer}>{tree.map(node => renderNode(node))}</div>
                )}
            </div>

            {/* Category Create/Edit Drawer */}
            <SystemDrawer
                open={isCategoryDrawerOpen}
                onClose={() => setIsCategoryDrawerOpen(false)}
                width={400}
            >
                <DrawerLayout
                    header={
                        <div>
                            <Text variant="title-sm" weight={600}>
                                {editingCategory ? "Modifica Categoria" : "Nuova Categoria"}
                            </Text>
                            {parentCategory && (
                                <Text variant="caption" colorVariant="muted">
                                    All'interno di "{parentCategory.name}" (Livello{" "}
                                    {parentCategory.level + 1})
                                </Text>
                            )}
                        </div>
                    }
                    footer={
                        <div className={styles.drawerFooterContainer}>
                            <div className={styles.drawerFooter}>
                                <Button
                                    variant="secondary"
                                    onClick={() => setIsCategoryDrawerOpen(false)}
                                    disabled={isSavingCategory}
                                >
                                    Annulla
                                </Button>
                                <Button
                                    variant="primary"
                                    type="submit"
                                    form="category-form"
                                    loading={isSavingCategory}
                                >
                                    Salva
                                </Button>
                            </div>
                        </div>
                    }
                >
                    <form id="category-form" onSubmit={handleSaveCategory} className={styles.form}>
                        <TextInput
                            label="Nome Categoria"
                            required
                            value={categoryName}
                            onChange={e => setCategoryName(e.target.value)}
                            placeholder="Es: Pizze, Bevande..."
                        />
                    </form>
                </DrawerLayout>
            </SystemDrawer>

            {/* Delete Category Warning */}
            <SystemDrawer
                open={!!categoryToDelete}
                onClose={() => setCategoryToDelete(null)}
                width={400}
            >
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={600}>
                            Elimina Categoria
                        </Text>
                    }
                    footer={
                        <div className={styles.drawerFooterContainer}>
                            <div className={styles.drawerFooter}>
                                <Button
                                    variant="secondary"
                                    onClick={() => setCategoryToDelete(null)}
                                    disabled={isDeletingCategory}
                                >
                                    Annulla
                                </Button>
                                <Button
                                    variant="primary"
                                    style={{
                                        backgroundColor: "var(--color-red-600)",
                                        borderColor: "var(--color-red-600)"
                                    }}
                                    onClick={handleDeleteCategory}
                                    loading={isDeletingCategory}
                                >
                                    Elimina
                                </Button>
                            </div>
                        </div>
                    }
                >
                    <div className={styles.deleteWarning}>
                        <Text variant="body-sm">
                            Eliminando "{categoryToDelete?.name}", rimuoverai anche{" "}
                            <strong>TUTTE le sotto-categorie e i collegamenti dei prodotti</strong>{" "}
                            al suo interno.
                        </Text>
                    </div>
                </DrawerLayout>
            </SystemDrawer>

            {/* Add Product Drawer */}
            <SystemDrawer
                open={isProductDrawerOpen}
                onClose={() => setIsProductDrawerOpen(false)}
                width={450}
            >
                <DrawerLayout
                    header={
                        <div>
                            <Text variant="title-sm" weight={600}>
                                Aggiungi Prodotto
                            </Text>
                            <Text variant="caption" colorVariant="muted">
                                Categoria di destinazione: {targetCategoryForProduct?.name}
                            </Text>
                        </div>
                    }
                    footer={
                        <div className={styles.drawerFooterContainer}>
                            <div className={styles.drawerFooter}>
                                <Button
                                    variant="secondary"
                                    onClick={() => setIsProductDrawerOpen(false)}
                                >
                                    Chiudi
                                </Button>
                            </div>
                        </div>
                    }
                >
                    <div className={styles.form}>
                        <TextInput
                            placeholder="Cerca per nome..."
                            value={productSearch}
                            onChange={e => setProductSearch(e.target.value)}
                        />

                        <div
                            style={{
                                marginTop: "16px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px"
                            }}
                        >
                            {filteredProductsForDrawer.slice(0, 20).map(prod => (
                                <div
                                    key={prod.id}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "8px",
                                        border: "1px solid var(--color-gray-200)",
                                        borderRadius: "var(--radius-md)"
                                    }}
                                >
                                    <div>
                                        <Text variant="body-sm" weight={500}>
                                            {prod.name}
                                        </Text>
                                        {(prod as any).parent_product_id && (
                                            <Text variant="caption" colorVariant="muted">
                                                Variante
                                            </Text>
                                        )}
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="primary"
                                        onClick={() => handleAddProduct(prod.id)}
                                        disabled={isAssigningProduct}
                                    >
                                        <IconPlus size={14} /> Add
                                    </Button>
                                </div>
                            ))}
                            {filteredProductsForDrawer.length === 0 && (
                                <Text variant="body-sm" colorVariant="muted">
                                    Nessun prodotto trovato.
                                </Text>
                            )}
                            {filteredProductsForDrawer.length > 20 && (
                                <Text variant="caption" colorVariant="muted">
                                    Mostrando i primi 20 risultati. Affina la ricerca.
                                </Text>
                            )}
                        </div>
                    </div>
                </DrawerLayout>
            </SystemDrawer>
        </section>
    );
}
