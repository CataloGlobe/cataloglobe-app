import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Breadcrumb, { type BreadcrumbItem } from "@/components/ui/Breadcrumb/Breadcrumb";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { Select } from "@/components/ui/Select/Select";
import {
    DndContext,
    PointerSensor,
    KeyboardSensor,
    closestCenter,
    useSensor,
    useSensors,
    DragEndEvent
} from "@dnd-kit/core";
import {
    SortableContext,
    verticalListSortingStrategy,
    arrayMove,
    useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconGripVertical, IconPhoto } from "@tabler/icons-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import {
    addProductToCategory,
    updateProductSortOrder,
    createCategory,
    deleteCategory,
    listCategories,
    listCategoryProducts,
    removeProductFromCategory,
    updateCategory,
    V2Catalog,
    V2CatalogCategory,
    V2CatalogCategoryProduct
} from "@/services/supabase/v2/catalogs";
import { ProductCreateEditDrawer } from "@/pages/Dashboard/Products/ProductCreateEditDrawer";
import { listBaseProductsWithVariants, V2Product } from "@/services/supabase/v2/products";
import { getProductGroups, ProductGroup } from "@/services/supabase/v2/productGroups";
import { listAttributeDefinitions } from "@/services/supabase/v2/attributes";
import { supabase } from "@/services/supabase/client";
import { CatalogSplitLayout } from "./components/CatalogSplitLayout";
import { CatalogTree } from "./components/CatalogTree";
import { CatalogTreeNodeData } from "./components/CatalogTree.types";
import styles from "./CatalogEngine.module.scss";

type ProductRow = {
    id: string;
    linkId: string;
    productId: string;
    name: string;
    sku: string | null;
    price: number | null;
};

type ProductAttributeValueRow = {
    product_id: string;
    attribute_definition_id: string;
    value_text: string | null;
};

function formatPrice(value: number | null): string {
    if (value === null) return "—";
    return `€${value.toFixed(2)}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    return fallback;
}

function sortByOrderAndCreated<T extends { sort_order: number; created_at: string }>(
    rows: T[]
): T[] {
    return [...rows].sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
}

function areSetsEqual<T>(a: Set<T>, b: Set<T>): boolean {
    if (a.size !== b.size) return false;
    for (const item of a) {
        if (!b.has(item)) return false;
    }
    return true;
}

function buildCategoryTree(
    categories: V2CatalogCategory[],
    categoryProducts: V2CatalogCategoryProduct[]
): CatalogTreeNodeData[] {
    const directCountByCategoryId = new Map<string, number>();
    for (const category of categories) {
        directCountByCategoryId.set(category.id, 0);
    }
    for (const link of categoryProducts) {
        directCountByCategoryId.set(
            link.category_id,
            (directCountByCategoryId.get(link.category_id) ?? 0) + 1
        );
    }

    const nodeMap = new Map<string, CatalogTreeNodeData>();
    for (const category of categories) {
        nodeMap.set(category.id, {
            ...category,
            children: [],
            directProductCount: directCountByCategoryId.get(category.id) ?? 0,
            totalProductCount: 0
        });
    }

    const roots: CatalogTreeNodeData[] = [];
    for (const category of categories) {
        const node = nodeMap.get(category.id);
        if (!node) continue;

        if (category.parent_category_id) {
            const parent = nodeMap.get(category.parent_category_id);
            if (parent) {
                parent.children.push(node);
                continue;
            }
        }
        roots.push(node);
    }

    const sortAndAggregate = (nodes: CatalogTreeNodeData[]): number => {
        nodes.sort((a, b) => {
            if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });

        let subtotal = 0;
        for (const node of nodes) {
            const childrenTotal = sortAndAggregate(node.children);
            node.totalProductCount = node.directProductCount + childrenTotal;
            subtotal += node.totalProductCount;
        }
        return subtotal;
    };

    sortAndAggregate(roots);
    return roots;
}

function buildChildrenMap(categories: V2CatalogCategory[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const category of categories) {
        const parentId = category.parent_category_id;
        if (!parentId) continue;
        const children = map.get(parentId) ?? [];
        children.push(category.id);
        map.set(parentId, children);
    }
    return map;
}

function collectDescendantIds(rootId: string, childrenMap: Map<string, string[]>): string[] {
    const descendants: string[] = [];
    const stack = [...(childrenMap.get(rootId) ?? [])];

    while (stack.length > 0) {
        const currentId = stack.pop();
        if (!currentId) continue;
        descendants.push(currentId);
        const children = childrenMap.get(currentId) ?? [];
        stack.push(...children);
    }

    return descendants;
}

type SortableProductRowProps = {
    children: React.ReactNode;
    id: string;
};

const SortableProductRow = ({ children, id }: SortableProductRowProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id
    });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : 0,
        position: "relative",
        opacity: isDragging ? 0.5 : 1
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes}>
            {React.Children.map(children, child => {
                if (React.isValidElement(child)) {
                    // Inject listeners only to the drag handle icon if found
                    // We need to pass the listeners to the specific cell that contains IconGripVertical
                    return React.cloneElement(child as React.ReactElement<any>, {
                        dragHandleProps: listeners
                    });
                }
                return child;
            })}
        </div>
    );
};

export default function CatalogEngine() {
    const { id: catalogId } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user } = useAuth();
    const currentTenantId = user?.id;
    const { showToast } = useToast();

    const selectedCategoryId = searchParams.get("categoryId");

    const [catalog, setCatalog] = useState<V2Catalog | null>(null);
    const [categories, setCategories] = useState<V2CatalogCategory[]>([]);
    const [categoryProducts, setCategoryProducts] = useState<V2CatalogCategoryProduct[]>([]);
    const [allProducts, setAllProducts] = useState<V2Product[]>([]);

    const [skuByProductId, setSkuByProductId] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isReorderingCategories, setIsReorderingCategories] = useState(false);
    const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set());

    const [productSearch, setProductSearch] = useState("");
    const [selectedProductLinkIds, setSelectedProductLinkIds] = useState<Set<string>>(new Set());
    const [isRemovingProducts, setIsRemovingProducts] = useState(false);

    const [isCategoryDrawerOpen, setIsCategoryDrawerOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<V2CatalogCategory | null>(null);
    const [categoryName, setCategoryName] = useState("");
    const [categoryParentId, setCategoryParentId] = useState("");
    const [isSavingCategory, setIsSavingCategory] = useState(false);

    const [categoryToDelete, setCategoryToDelete] = useState<V2CatalogCategory | null>(null);
    const [isDeletingCategory, setIsDeletingCategory] = useState(false);

    const [isAssignProductDrawerOpen, setIsAssignProductDrawerOpen] = useState(false);
    const [assignProductSearch, setAssignProductSearch] = useState("");
    const [isAssigningProduct, setIsAssigningProduct] = useState(false);
    const [selectedAssignProductIds, setSelectedAssignProductIds] = useState<Set<string>>(
        new Set()
    );
    const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
    const [productGroupMap, setProductGroupMap] = useState<Map<string, string[]>>(new Map());
    const [assignGroupId, setAssignGroupId] = useState<string | null>(null);

    const [isCreateProductDrawerOpen, setIsCreateProductDrawerOpen] = useState(false);

    const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

    const setSelectedCategoryInUrl = useCallback(
        (nextCategoryId: string | null, replace: boolean = false) => {
            setSearchParams(
                prev => {
                    const nextParams = new URLSearchParams(prev);
                    if (nextCategoryId) {
                        nextParams.set("categoryId", nextCategoryId);
                    } else {
                        nextParams.delete("categoryId");
                    }
                    return nextParams;
                },
                { replace }
            );
        },
        [setSearchParams]
    );

    const breadcrumbItems = useMemo<BreadcrumbItem[]>(
        () => [
            { label: "Cataloghi", to: "/dashboard/cataloghi" },
            { label: catalog?.name || "Catalogo" }
        ],
        [catalog?.name]
    );

    const categoriesById = useMemo(
        () => new Map(categories.map(category => [category.id, category])),
        [categories]
    );

    const productById = useMemo(() => {
        const map = new Map<string, V2Product>();
        for (const baseProduct of allProducts) {
            map.set(baseProduct.id, baseProduct);
            for (const variant of baseProduct.variants ?? []) {
                map.set(variant.id, variant);
            }
        }
        return map;
    }, [allProducts]);

    const tree = useMemo(
        () => buildCategoryTree(categories, categoryProducts),
        [categories, categoryProducts]
    );

    const selectedCategory = useMemo(() => {
        if (!selectedCategoryId) return null;
        return categoriesById.get(selectedCategoryId) ?? null;
    }, [categoriesById, selectedCategoryId]);

    const selectedCategoryLinks = useMemo(() => {
        if (!selectedCategoryId) return [];
        return sortByOrderAndCreated(
            categoryProducts.filter(link => link.category_id === selectedCategoryId)
        );
    }, [categoryProducts, selectedCategoryId]);

    const selectedCategoryProductIds = useMemo(
        () => new Set(selectedCategoryLinks.map(link => link.product_id)),
        [selectedCategoryLinks]
    );

    const productRows = useMemo<ProductRow[]>(() => {
        return selectedCategoryLinks.map(link => {
            const product = productById.get(link.product_id);
            return {
                id: link.id,
                linkId: link.id,
                productId: link.product_id,
                name: product?.name ?? "Prodotto sconosciuto",
                sku: skuByProductId[link.product_id] ?? null,
                price: product?.base_price ?? null
            };
        });
    }, [productById, selectedCategoryLinks, skuByProductId]);

    const filteredRows = useMemo(() => {
        const normalizedSearch = productSearch.trim().toLowerCase();
        if (!normalizedSearch) return productRows;
        return productRows.filter(row => {
            const haystack = `${row.name} ${row.sku ?? ""}`.toLowerCase();
            return haystack.includes(normalizedSearch);
        });
    }, [productRows, productSearch]);

    const assignableProducts = useMemo(() => {
        const normalizedSearch = assignProductSearch.trim().toLowerCase();
        const flattenedProducts: V2Product[] = [];
        for (const baseProduct of allProducts) {
            flattenedProducts.push(baseProduct);
            for (const variant of baseProduct.variants ?? []) {
                flattenedProducts.push(variant);
            }
        }

        return flattenedProducts.filter(product => {
            if (selectedCategoryProductIds.has(product.id)) return false;

            if (assignGroupId) {
                const groups = productGroupMap.get(product.id) ?? [];
                if (!groups.includes(assignGroupId)) return false;
            }

            if (!normalizedSearch) return true;
            return product.name.toLowerCase().includes(normalizedSearch);
        });
    }, [
        allProducts,
        assignProductSearch,
        selectedCategoryProductIds,
        assignGroupId,
        productGroupMap
    ]);

    const allFilteredSelected =
        filteredRows.length > 0 &&
        filteredRows.every(row => selectedProductLinkIds.has(row.linkId));
    const someFilteredSelected = filteredRows.some(row => selectedProductLinkIds.has(row.linkId));

    useEffect(() => {
        if (!selectAllCheckboxRef.current) return;
        selectAllCheckboxRef.current.indeterminate = someFilteredSelected && !allFilteredSelected;
    }, [allFilteredSelected, someFilteredSelected]);

    const getNextSortOrder = useCallback(
        (parentId: string | null) => {
            const siblings = categories.filter(
                category => category.parent_category_id === parentId
            );
            if (siblings.length === 0) return 0;
            return Math.max(...siblings.map(category => category.sort_order)) + 10;
        },
        [categories]
    );

    const loadProductMetadata = useCallback(async () => {
        if (!currentTenantId) return;

        const nextSkuMap: Record<string, string> = {};
        try {
            const definitions = await listAttributeDefinitions(currentTenantId);
            const skuDefId = definitions.find(def => def.code === "sku")?.id;
            const targetDefIds = [skuDefId].filter(
                (defId): defId is string => typeof defId === "string"
            );

            if (targetDefIds.length > 0) {
                const { data: valueRows, error: valueError } = await supabase
                    .from("v2_product_attribute_values")
                    .select("product_id, attribute_definition_id, value_text")
                    .eq("tenant_id", currentTenantId)
                    .in("attribute_definition_id", targetDefIds);

                if (valueError) throw valueError;

                for (const row of (valueRows ?? []) as ProductAttributeValueRow[]) {
                    if (skuDefId && row.attribute_definition_id === skuDefId) {
                        if (
                            typeof row.value_text === "string" &&
                            row.value_text.trim().length > 0
                        ) {
                            nextSkuMap[row.product_id] = row.value_text.trim();
                        }
                    }
                }
            }
        } catch (error) {
            console.warn("Impossibile caricare metadata prodotti:", error);
        }

        setSkuByProductId(nextSkuMap);
    }, [currentTenantId]);

    const loadData = useCallback(async () => {
        if (!currentTenantId || !catalogId) return;

        setIsLoading(true);
        try {
            const [
                { data: catalogData, error: catalogError },
                loadedCategories,
                loadedLinks,
                loadedProducts,
                loadedGroups,
                loadedGroupItems
            ] = await Promise.all([
                supabase
                    .from("v2_catalogs")
                    .select("*")
                    .eq("id", catalogId)
                    .eq("tenant_id", currentTenantId)
                    .single(),
                listCategories(currentTenantId, catalogId),
                listCategoryProducts(currentTenantId, catalogId),
                listBaseProductsWithVariants(currentTenantId),
                getProductGroups(currentTenantId),
                supabase
                    .from("v2_product_group_items")
                    .select("product_id, group_id")
                    .eq("tenant_id", currentTenantId)
            ]);

            if (catalogError) throw catalogError;

            const groupItems =
                (loadedGroupItems.data as { product_id: string; group_id: string }[]) || [];
            const nextGroupMap = new Map<string, string[]>();
            for (const item of groupItems) {
                const existing = nextGroupMap.get(item.product_id) ?? [];
                nextGroupMap.set(item.product_id, [...existing, item.group_id]);
            }

            setCatalog(catalogData as V2Catalog);
            setCategories(loadedCategories);
            setCategoryProducts(loadedLinks);
            setAllProducts(loadedProducts);
            setProductGroups(loadedGroups);
            setProductGroupMap(nextGroupMap);

            await loadProductMetadata();
        } catch (error) {
            console.error(error);
            showToast({ message: "Errore durante il caricamento del catalogo.", type: "error" });
            navigate("/dashboard/cataloghi");
        } finally {
            setIsLoading(false);
        }
    }, [catalogId, currentTenantId, loadProductMetadata, navigate, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (tree.length === 0) {
            setExpandedCategoryIds(prev => (prev.size === 0 ? prev : new Set()));
            return;
        }

        setExpandedCategoryIds(prev => {
            const next = new Set(prev);
            if (next.size === 0) {
                for (const root of tree) {
                    next.add(root.id);
                }
            }

            if (selectedCategoryId) {
                let current = categoriesById.get(selectedCategoryId) ?? null;
                while (current?.parent_category_id) {
                    next.add(current.parent_category_id);
                    current = categoriesById.get(current.parent_category_id) ?? null;
                }
            }

            return areSetsEqual(prev, next) ? prev : next;
        });
    }, [categoriesById, selectedCategoryId, tree]);

    useEffect(() => {
        if (!selectedCategoryId) return;
        if (categoriesById.has(selectedCategoryId)) return;

        const fallbackRootId = tree[0]?.id ?? null;
        setSelectedCategoryInUrl(fallbackRootId, true);
    }, [categoriesById, selectedCategoryId, setSelectedCategoryInUrl, tree]);

    useEffect(() => {
        setSelectedProductLinkIds(new Set());
        setSelectedAssignProductIds(new Set());
        setAssignGroupId(null);
        setAssignProductSearch("");
    }, [selectedCategoryId]);

    const createParentOptions = useMemo(() => {
        const options = [{ value: "", label: "Nessuna (categoria root)" }];
        const eligibleParents = sortByOrderAndCreated(categories).filter(
            category => category.level < 3
        );
        for (const parent of eligibleParents) {
            const prefix = parent.level > 1 ? `${"-- ".repeat(parent.level - 1)}` : "";
            options.push({
                value: parent.id,
                label: `${prefix}${parent.name}`
            });
        }
        return options;
    }, [categories]);

    const openCreateRootCategoryDrawer = useCallback(() => {
        setEditingCategory(null);
        setCategoryName("");
        setCategoryParentId("");
        setIsCategoryDrawerOpen(true);
    }, []);

    const openCreateSubCategoryDrawer = useCallback(
        (parentCategoryId: string) => {
            const parent = categoriesById.get(parentCategoryId);
            if (!parent) return;

            if (parent.level >= 3) {
                showToast({
                    message: "Non puoi creare categorie oltre il livello 3.",
                    type: "error"
                });
                return;
            }

            setEditingCategory(null);
            setCategoryName("");
            setCategoryParentId(parent.id);
            setExpandedCategoryIds(prev => new Set(prev).add(parent.id));
            setIsCategoryDrawerOpen(true);
        },
        [categoriesById, showToast]
    );

    const openEditCategoryDrawer = useCallback(
        (categoryId: string) => {
            const category = categoriesById.get(categoryId);
            if (!category) return;
            setEditingCategory(category);
            setCategoryName(category.name);
            setCategoryParentId(category.parent_category_id ?? "");
            setIsCategoryDrawerOpen(true);
        },
        [categoriesById]
    );

    const openDeleteCategoryDrawer = useCallback(
        (categoryId: string) => {
            const category = categoriesById.get(categoryId);
            if (!category) return;
            setCategoryToDelete(category);
        },
        [categoriesById]
    );

    const handleSaveCategory = useCallback(
        async (event: React.FormEvent) => {
            event.preventDefault();
            if (!currentTenantId || !catalogId) return;

            if (!categoryName.trim()) {
                showToast({ message: "Il nome della categoria è obbligatorio.", type: "error" });
                return;
            }

            setIsSavingCategory(true);
            try {
                if (editingCategory) {
                    await updateCategory(editingCategory.id, currentTenantId, {
                        name: categoryName.trim()
                    });
                    showToast({ message: "Categoria aggiornata.", type: "success" });
                    setIsCategoryDrawerOpen(false);
                    await loadData();
                    return;
                }

                const parentId = categoryParentId || null;
                const parentCategory = parentId ? (categoriesById.get(parentId) ?? null) : null;
                if (parentCategory && parentCategory.level >= 3) {
                    showToast({
                        message: "La categoria padre selezionata è già al livello massimo.",
                        type: "error"
                    });
                    return;
                }

                const targetLevel = parentCategory ? ((parentCategory.level + 1) as 1 | 2 | 3) : 1;
                const finalSortOrder = getNextSortOrder(parentId);

                const createdCategory = await createCategory(
                    currentTenantId,
                    catalogId,
                    categoryName.trim(),
                    targetLevel,
                    parentId,
                    finalSortOrder
                );

                showToast({ message: "Categoria creata.", type: "success" });
                setIsCategoryDrawerOpen(false);
                await loadData();
                setSelectedCategoryInUrl(createdCategory.id);
            } catch (error: unknown) {
                console.error(error);
                showToast({
                    message: getErrorMessage(error, "Errore salvataggio categoria."),
                    type: "error"
                });
            } finally {
                setIsSavingCategory(false);
            }
        },
        [
            catalogId,
            categoriesById,
            categoryName,
            categoryParentId,
            currentTenantId,
            editingCategory,
            getNextSortOrder,
            loadData,
            setSelectedCategoryInUrl,
            showToast
        ]
    );

    const handleDeleteCategory = useCallback(async () => {
        if (!currentTenantId || !categoryToDelete) return;

        setIsDeletingCategory(true);
        try {
            const childrenMap = buildChildrenMap(categories);
            const deletedIds = new Set([
                categoryToDelete.id,
                ...collectDescendantIds(categoryToDelete.id, childrenMap)
            ]);

            const selectedInDeletedBranch = selectedCategoryId
                ? deletedIds.has(selectedCategoryId)
                : false;

            let fallbackCategoryId: string | null = null;
            if (selectedInDeletedBranch) {
                if (categoryToDelete.parent_category_id) {
                    fallbackCategoryId = categoryToDelete.parent_category_id;
                } else {
                    const remainingRoots = sortByOrderAndCreated(
                        categories.filter(
                            category => !category.parent_category_id && !deletedIds.has(category.id)
                        )
                    );
                    fallbackCategoryId = remainingRoots[0]?.id ?? null;
                }
            }

            await deleteCategory(categoryToDelete.id, currentTenantId);
            showToast({ message: "Categoria eliminata.", type: "success" });
            setCategoryToDelete(null);
            await loadData();

            if (selectedInDeletedBranch) {
                setSelectedCategoryInUrl(fallbackCategoryId);
            }
        } catch (error) {
            console.error(error);
            showToast({ message: "Errore durante l'eliminazione.", type: "error" });
        } finally {
            setIsDeletingCategory(false);
        }
    }, [
        categories,
        categoryToDelete,
        currentTenantId,
        loadData,
        selectedCategoryId,
        setSelectedCategoryInUrl,
        showToast
    ]);

    const handleReorderSiblings = useCallback(
        async (parentCategoryId: string | null, orderedSiblingIds: string[]) => {
            if (!currentTenantId || orderedSiblingIds.length === 0) return;

            setIsReorderingCategories(true);
            try {
                const siblingsById = new Map(
                    categories
                        .filter(category => category.parent_category_id === parentCategoryId)
                        .map(category => [category.id, category])
                );

                const updates = orderedSiblingIds
                    .map((categoryId, index) => {
                        const category = siblingsById.get(categoryId);
                        if (!category) return null;
                        const nextOrder = index * 10;
                        if (category.sort_order === nextOrder) return null;
                        return { categoryId, nextOrder };
                    })
                    .filter(
                        (row): row is { categoryId: string; nextOrder: number } => row !== null
                    );

                if (updates.length === 0) return;

                await Promise.all(
                    updates.map(update =>
                        updateCategory(update.categoryId, currentTenantId, {
                            sort_order: update.nextOrder
                        })
                    )
                );
                await loadData();
            } catch (error) {
                console.error(error);
                showToast({ message: "Impossibile riordinare le categorie.", type: "error" });
            } finally {
                setIsReorderingCategories(false);
            }
        },
        [categories, currentTenantId, loadData, showToast]
    );

    const toggleCategoryExpansion = useCallback((categoryId: string) => {
        setExpandedCategoryIds(prev => {
            const next = new Set(prev);
            if (next.has(categoryId)) {
                next.delete(categoryId);
            } else {
                next.add(categoryId);
            }
            return next;
        });
    }, []);

    const toggleAssignProduct = useCallback((productId: string) => {
        setSelectedAssignProductIds(prev => {
            const next = new Set(prev);
            if (next.has(productId)) {
                next.delete(productId);
            } else {
                next.add(productId);
            }
            return next;
        });
    }, []);

    const handleReorderProducts = useCallback(
        async (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id || !currentTenantId || !selectedCategoryId) return;

            const oldIndex = filteredRows.findIndex(row => row.id === active.id);
            const newIndex = filteredRows.findIndex(row => row.id === over.id);

            if (oldIndex < 0 || newIndex < 0) return;

            const reordered = arrayMove(filteredRows, oldIndex, newIndex);

            // Optimistic update
            const nextLinks = [...categoryProducts];
            const updatedLinkIds: string[] = [];

            reordered.forEach((row, index) => {
                const linkIndex = nextLinks.findIndex(l => l.id === row.id);
                if (linkIndex >= 0) {
                    const nextSortOrder = index * 10;
                    if (nextLinks[linkIndex].sort_order !== nextSortOrder) {
                        nextLinks[linkIndex] = {
                            ...nextLinks[linkIndex],
                            sort_order: nextSortOrder
                        };
                        updatedLinkIds.push(nextLinks[linkIndex].id);
                    }
                }
            });

            setCategoryProducts(nextLinks);

            // Persist changes
            try {
                await Promise.all(
                    updatedLinkIds.map(linkId => {
                        const link = nextLinks.find(l => l.id === linkId);
                        if (!link) return Promise.resolve();
                        return updateProductSortOrder(linkId, currentTenantId, link.sort_order);
                    })
                );
            } catch (error) {
                console.error("Errore durante il riordinamento prodotti:", error);
                showToast({ message: "Errore durante il salvataggio dell'ordine.", type: "error" });
                void loadData();
            }
        },
        [filteredRows, currentTenantId, selectedCategoryId, categoryProducts, showToast, loadData]
    );

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor)
    );

    const handleAssignExistingProduct = useCallback(
        async (productId: string) => {
            if (!currentTenantId || !catalogId || !selectedCategoryId) return;

            setIsAssigningProduct(true);
            try {
                const nextSortOrder =
                    selectedCategoryLinks.length > 0
                        ? Math.max(...selectedCategoryLinks.map(link => link.sort_order)) + 10
                        : 0;

                await addProductToCategory(
                    currentTenantId,
                    catalogId,
                    selectedCategoryId,
                    productId,
                    nextSortOrder
                );
                showToast({ message: "Prodotto associato alla categoria.", type: "success" });
                await loadData();
            } catch (error: unknown) {
                console.error(error);
                showToast({
                    message: getErrorMessage(error, "Impossibile associare il prodotto."),
                    type: "error"
                });
            } finally {
                setIsAssigningProduct(false);
            }
        },
        [catalogId, currentTenantId, loadData, selectedCategoryId, selectedCategoryLinks, showToast]
    );

    const handleBulkAssignProducts = useCallback(async () => {
        if (
            !currentTenantId ||
            !catalogId ||
            !selectedCategoryId ||
            selectedAssignProductIds.size === 0
        )
            return;

        setIsAssigningProduct(true);
        try {
            const currentMaxOrder =
                selectedCategoryLinks.length > 0
                    ? Math.max(...selectedCategoryLinks.map(link => link.sort_order))
                    : -10;

            const results = await Promise.allSettled(
                Array.from(selectedAssignProductIds).map((productId, index) =>
                    addProductToCategory(
                        currentTenantId,
                        catalogId,
                        selectedCategoryId,
                        productId,
                        currentMaxOrder + (index + 1) * 10
                    )
                )
            );

            const successCount = results.filter(r => r.status === "fulfilled").length;
            const failedCount = results.length - successCount;

            if (successCount > 0) {
                if (failedCount === 0) {
                    showToast({
                        message: `${successCount} prodotti associati con successo.`,
                        type: "success"
                    });
                } else {
                    showToast({
                        message: `${successCount} associati, ${failedCount} non associati (già presenti o errore).`,
                        type: "info"
                    });
                }
            } else if (failedCount > 0) {
                showToast({
                    message: "Impossibile associare i prodotti selezionati.",
                    type: "error"
                });
            }

            await loadData();
            setSelectedAssignProductIds(new Set());
            setIsAssignProductDrawerOpen(false);
        } catch (error) {
            console.error(error);
            showToast({ message: "Errore durante l'associazione multipla.", type: "error" });
        } finally {
            setIsAssigningProduct(false);
        }
    }, [
        catalogId,
        currentTenantId,
        loadData,
        selectedAssignProductIds,
        selectedCategoryId,
        selectedCategoryLinks,
        showToast
    ]);

    const handleProductCreated = useCallback(
        async (createdProduct?: V2Product) => {
            if (!currentTenantId || !catalogId || !selectedCategoryId || !createdProduct) {
                await loadData();
                return;
            }

            try {
                const currentLinks = categoryProducts.filter(
                    link => link.category_id === selectedCategoryId
                );
                const nextSortOrder =
                    currentLinks.length > 0
                        ? Math.max(...currentLinks.map(link => link.sort_order)) + 10
                        : 0;

                await addProductToCategory(
                    currentTenantId,
                    catalogId,
                    selectedCategoryId,
                    createdProduct.id,
                    nextSortOrder
                );
                showToast({
                    message: "Prodotto creato e assegnato alla categoria.",
                    type: "success"
                });
            } catch (error: unknown) {
                console.error(error);
                showToast({
                    message: getErrorMessage(
                        error,
                        "Prodotto creato, ma non è stato possibile associarlo alla categoria."
                    ),
                    type: "error"
                });
            } finally {
                await loadData();
            }
        },
        [catalogId, categoryProducts, currentTenantId, loadData, selectedCategoryId, showToast]
    );

    const handleToggleRowSelection = useCallback((linkId: string, checked: boolean) => {
        setSelectedProductLinkIds(prev => {
            const next = new Set(prev);
            if (checked) {
                next.add(linkId);
            } else {
                next.delete(linkId);
            }
            return next;
        });
    }, []);

    const handleToggleAllFiltered = useCallback(
        (checked: boolean) => {
            setSelectedProductLinkIds(prev => {
                const next = new Set(prev);
                for (const row of filteredRows) {
                    if (checked) next.add(row.linkId);
                    else next.delete(row.linkId);
                }
                return next;
            });
        },
        [filteredRows]
    );

    const handleBulkRemoveSelected = useCallback(async () => {
        if (!currentTenantId || selectedProductLinkIds.size === 0) return;

        setIsRemovingProducts(true);
        try {
            await Promise.all(
                Array.from(selectedProductLinkIds).map(linkId =>
                    removeProductFromCategory(currentTenantId, linkId)
                )
            );
            showToast({ message: "Prodotti rimossi dalla categoria.", type: "success" });
            setSelectedProductLinkIds(new Set());
            await loadData();
        } catch (error) {
            console.error(error);
            showToast({
                message: "Errore durante la rimozione dei prodotti selezionati.",
                type: "error"
            });
        } finally {
            setIsRemovingProducts(false);
        }
    }, [currentTenantId, loadData, selectedProductLinkIds, showToast]);

    const columns = useMemo<ColumnDefinition<ProductRow>[]>(
        () => [
            {
                id: "select",
                header: (
                    <div className={styles.checkboxCell}>
                        <input
                            ref={selectAllCheckboxRef}
                            type="checkbox"
                            checked={allFilteredSelected}
                            onChange={event => handleToggleAllFiltered(event.target.checked)}
                            className={styles.tableCheckbox}
                            aria-label="Seleziona tutti i prodotti filtrati"
                        />
                    </div>
                ),
                width: "54px",
                align: "center",
                cell: (_value, row) => (
                    <div className={styles.checkboxCell}>
                        <input
                            type="checkbox"
                            checked={selectedProductLinkIds.has(row.linkId)}
                            onChange={event =>
                                handleToggleRowSelection(row.linkId, event.target.checked)
                            }
                            className={styles.tableCheckbox}
                            aria-label={`Seleziona ${row.name}`}
                        />
                    </div>
                )
            },
            {
                id: "drag",
                header: "",
                width: "50px",
                align: "center",
                cell: (_value, _row, _rowIndex, dragHandleProps?: any) => (
                    <span className={styles.dragCell} {...dragHandleProps}>
                        <IconGripVertical size={16} />
                    </span>
                )
            },
            {
                id: "photo",
                header: "Foto",
                width: "78px",
                align: "center",
                cell: () => (
                    <span className={styles.productThumb}>
                        <IconPhoto size={16} />
                    </span>
                )
            },
            {
                id: "name",
                header: "Nome prodotto",
                width: "2fr",
                cell: (_value, row) => (
                    <div className={styles.productNameCell}>
                        <Text variant="body-sm" weight={600} className={styles.productNameMain}>
                            {row.name}
                        </Text>
                        {row.sku && (
                            <Text variant="caption" className={styles.productSku}>
                                {row.sku}
                            </Text>
                        )}
                    </div>
                )
            },
            {
                id: "price",
                header: "Prezzo",
                width: "0.9fr",
                accessor: row => row.price,
                cell: value => <Text variant="body-sm">{formatPrice(value as number | null)}</Text>
            }
        ],
        [
            allFilteredSelected,
            handleToggleAllFiltered,
            handleToggleRowSelection,
            selectedProductLinkIds
        ]
    );

    const renderRightPane = () => {
        if (!selectedCategory) {
            return (
                <div className={styles.productsEmptySelection}>
                    <div className={styles.emptyCard}>
                        <Text variant="title-md" weight={700}>
                            Seleziona una categoria
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Seleziona una categoria dall'albero per gestire i prodotti.
                        </Text>
                        <Button variant="primary" onClick={openCreateRootCategoryDrawer}>
                            Crea nuova categoria
                        </Button>
                    </div>
                </div>
            );
        }

        return (
            <div className={styles.productsPanel}>
                <div className={styles.productsHeader}>
                    <div className={styles.productsTitleRow}>
                        <div>
                            <Text variant="title-lg" weight={700}>
                                {selectedCategory.name}
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                {selectedCategoryLinks.length} prodotti
                            </Text>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    setAssignProductSearch("");
                                    setIsAssignProductDrawerOpen(true);
                                }}
                            >
                                Associa esistente
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => setIsCreateProductDrawerOpen(true)}
                            >
                                Crea prodotto
                            </Button>
                        </div>
                    </div>

                    <div className={styles.productsTools}>
                        <div className={styles.quickSearchWrap}>
                            <SearchInput
                                value={productSearch}
                                onChange={event => setProductSearch(event.target.value)}
                                onClear={() => setProductSearch("")}
                                placeholder="Filtro rapido (Nome, SKU...)"
                            />
                        </div>
                    </div>
                </div>

                <div className={styles.tableCard}>
                    {selectedProductLinkIds.size > 0 && (
                        <div className={styles.bulkBar}>
                            <Text variant="body-sm" weight={600}>
                                {selectedProductLinkIds.size} selezionati
                            </Text>
                            <div className={styles.bulkActions}>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setSelectedProductLinkIds(new Set())}
                                >
                                    Deseleziona
                                </Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handleBulkRemoveSelected}
                                    loading={isRemovingProducts}
                                >
                                    Rimuovi dalla categoria
                                </Button>
                            </div>
                        </div>
                    )}

                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleReorderProducts}
                    >
                        <SortableContext
                            items={filteredRows.map(r => r.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <DataTable<ProductRow>
                                data={filteredRows}
                                columns={columns}
                                emptyState={
                                    <div style={{ padding: "24px" }}>
                                        <Text variant="body-sm" colorVariant="muted">
                                            {productSearch.trim()
                                                ? "Nessun prodotto corrisponde al filtro."
                                                : "Nessun prodotto associato a questa categoria."}
                                        </Text>
                                    </div>
                                }
                                rowWrapper={(row, rowData) => (
                                    <SortableProductRow key={rowData.id} id={rowData.id}>
                                        {row}
                                    </SortableProductRow>
                                )}
                            />
                        </SortableContext>
                    </DndContext>
                </div>
            </div>
        );
    };

    return (
        <section className={styles.engineContainer}>
            <div className={styles.engineHeader}>
                <Breadcrumb items={breadcrumbItems} />
                <PageHeader
                    title={catalog?.name || "Catalogo"}
                    subtitle="Gestisci categorie e prodotti con navigazione ad albero."
                />
            </div>

            <div className={styles.engineBody}>
                {isLoading ? (
                    <div className={styles.loadingPanel}>
                        <Text variant="body-sm" colorVariant="muted">
                            Caricamento catalogo in corso...
                        </Text>
                    </div>
                ) : (
                    <CatalogSplitLayout
                        tree={
                            <CatalogTree
                                nodes={tree}
                                selectedCategoryId={selectedCategoryId}
                                expandedCategoryIds={expandedCategoryIds}
                                onToggleExpand={toggleCategoryExpansion}
                                onSelectCategory={categoryId =>
                                    setSelectedCategoryInUrl(categoryId)
                                }
                                onCreateRootCategory={openCreateRootCategoryDrawer}
                                onCreateSubCategory={openCreateSubCategoryDrawer}
                                onEditCategory={openEditCategoryDrawer}
                                onDeleteCategory={openDeleteCategoryDrawer}
                                onReorderSiblings={handleReorderSiblings}
                                isReordering={isReorderingCategories}
                            />
                        }
                        content={renderRightPane()}
                    />
                )}
            </div>

            <SystemDrawer
                open={isCategoryDrawerOpen}
                onClose={() => setIsCategoryDrawerOpen(false)}
                width={420}
            >
                <DrawerLayout
                    header={
                        <div>
                            <Text variant="title-sm" weight={700}>
                                {editingCategory ? "Modifica categoria" : "Nuova categoria"}
                            </Text>
                            {!editingCategory && categoryParentId && (
                                <Text variant="caption" colorVariant="muted">
                                    Parent preimpostato dalla selezione nel tree.
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
                                    form="catalog-category-form"
                                    loading={isSavingCategory}
                                >
                                    Salva
                                </Button>
                            </div>
                        </div>
                    }
                >
                    <form
                        id="catalog-category-form"
                        onSubmit={handleSaveCategory}
                        className={styles.form}
                    >
                        <TextInput
                            label="Nome"
                            value={categoryName}
                            onChange={event => setCategoryName(event.target.value)}
                            placeholder="Es: Antipasti, Bevande..."
                            required
                        />

                        {!editingCategory && (
                            <>
                                <Select
                                    label="Parent"
                                    value={categoryParentId}
                                    onChange={event => setCategoryParentId(event.target.value)}
                                    options={createParentOptions}
                                />
                            </>
                        )}
                    </form>
                </DrawerLayout>
            </SystemDrawer>

            <SystemDrawer
                open={Boolean(categoryToDelete)}
                onClose={() => setCategoryToDelete(null)}
                width={420}
            >
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={700}>
                            Elimina categoria
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
                                    onClick={handleDeleteCategory}
                                    loading={isDeletingCategory}
                                    style={{
                                        backgroundColor: "var(--color-red-600, #dc2626)",
                                        borderColor: "var(--color-red-600, #dc2626)"
                                    }}
                                >
                                    Elimina
                                </Button>
                            </div>
                        </div>
                    }
                >
                    <div className={styles.deleteWarning}>
                        <Text variant="body-sm">
                            Eliminando "<strong>{categoryToDelete?.name}</strong>" verranno rimosse
                            anche le relative sotto-categorie e i collegamenti ai prodotti.
                        </Text>
                    </div>
                </DrawerLayout>
            </SystemDrawer>

            <SystemDrawer
                open={isAssignProductDrawerOpen}
                onClose={() => {
                    setIsAssignProductDrawerOpen(false);
                    setSelectedAssignProductIds(new Set());
                    setAssignGroupId(null);
                    setAssignProductSearch("");
                }}
                width={460}
            >
                <DrawerLayout
                    header={
                        <div>
                            <Text variant="title-sm" weight={700}>
                                Associa prodotto esistente
                            </Text>
                            <Text variant="caption" colorVariant="muted">
                                Categoria: {selectedCategory?.name ?? "—"}
                            </Text>
                        </div>
                    }
                    footer={
                        <div className={styles.drawerFooterContainer}>
                            <div className={styles.drawerFooter}>
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setIsAssignProductDrawerOpen(false);
                                        setSelectedAssignProductIds(new Set());
                                        setAssignGroupId(null);
                                        setAssignProductSearch("");
                                    }}
                                >
                                    Chiudi
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={handleBulkAssignProducts}
                                    loading={isAssigningProduct}
                                    disabled={selectedAssignProductIds.size === 0}
                                >
                                    Associa selezionati ({selectedAssignProductIds.size})
                                </Button>
                            </div>
                        </div>
                    }
                >
                    <div className={styles.form}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            <Select
                                label="Gruppo prodotto"
                                value={assignGroupId ?? ""}
                                onChange={event => setAssignGroupId(event.target.value || null)}
                                options={[
                                    { value: "", label: "Tutti i gruppi" },
                                    ...productGroups.map(g => ({ value: g.id, label: g.name }))
                                ]}
                            />

                            <SearchInput
                                value={assignProductSearch}
                                onChange={event => setAssignProductSearch(event.target.value)}
                                onClear={() => setAssignProductSearch("")}
                                placeholder="Cerca prodotto..."
                            />
                        </div>

                        <div className={styles.assignResults}>
                            {assignableProducts.slice(0, 50).map(product => (
                                <div
                                    key={product.id}
                                    className={styles.assignRow}
                                    onClick={() => toggleAssignProduct(product.id)}
                                    style={{ cursor: "pointer" }}
                                >
                                    <div className={styles.assignMeta}>
                                        <Text variant="body-sm" weight={600}>
                                            {product.name}
                                        </Text>
                                        {product.parent_product_id && (
                                            <Text variant="caption" colorVariant="muted">
                                                Variante
                                            </Text>
                                        )}
                                    </div>
                                    <div className={styles.checkboxCell}>
                                        <input
                                            type="checkbox"
                                            checked={selectedAssignProductIds.has(product.id)}
                                            onChange={() => {}} // Handled by row click
                                            className={styles.tableCheckbox}
                                        />
                                    </div>
                                </div>
                            ))}

                            {assignableProducts.length === 0 && (
                                <Text variant="body-sm" colorVariant="muted">
                                    Nessun prodotto disponibile da associare.
                                </Text>
                            )}
                        </div>
                    </div>
                </DrawerLayout>
            </SystemDrawer>

            <ProductCreateEditDrawer
                open={isCreateProductDrawerOpen}
                onClose={() => setIsCreateProductDrawerOpen(false)}
                mode="create_base"
                productData={null}
                parentProduct={null}
                onSuccess={handleProductCreated}
                tenantId={currentTenantId}
            />
        </section>
    );
}
