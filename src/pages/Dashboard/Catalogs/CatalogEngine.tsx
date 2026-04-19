import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Breadcrumb, { type BreadcrumbItem } from "@/components/ui/Breadcrumb/Breadcrumb";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
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
import { IconGripVertical, IconPhoto, IconChevronDown, IconChevronRight, IconArrowLeft, IconDotsVertical } from "@tabler/icons-react";
import { DropdownMenu } from "@/components/ui/DropdownMenu/DropdownMenu";
import { DropdownItem } from "@/components/ui/DropdownMenu/DropdownItem";
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
    reparentCategory,
    updateDescendantLevels,
    V2Catalog,
    V2CatalogCategory,
    V2CatalogCategoryProduct
} from "@/services/supabase/catalogs";
import { listBaseProductsWithVariants, getProductListMetadata, V2Product } from "@/services/supabase/products";
import { getDisplayPrice } from "@/utils/priceDisplay";
import { getProductGroups, ProductGroup } from "@/services/supabase/productGroups";
import { listAttributeDefinitions } from "@/services/supabase/attributes";
import { supabase } from "@/services/supabase/client";
import { CatalogSplitLayout } from "./components/CatalogSplitLayout";
import { CatalogTree } from "./components/CatalogTree";
import { CatalogTreeNodeData } from "./components/CatalogTree.types";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { SplitButton } from "@/components/ui/Button/SplitButton";
import { ProductForm } from "@/pages/Dashboard/Products/components/ProductForm";
import styles from "./CatalogEngine.module.scss";

type CreateIntent = "associate" | "configure";

const LOCAL_LINK_PREFIX = "loc_";

function validateProductAddition(
    categoryId: string,
    productId: string,
    variantProductId: string | null,
    categories: V2CatalogCategory[],
    categoryProducts: V2CatalogCategoryProduct[]
): string | null {
    const parentMap = new Map<string, string | null>();
    categories.forEach(cat => parentMap.set(cat.id, cat.parent_category_id));

    const getAncestors = (catId: string): string[] => {
        const ancestors: string[] = [];
        let current = parentMap.get(catId);
        while (current) {
            ancestors.push(current);
            current = parentMap.get(current);
        }
        return ancestors;
    };

    const getDescendants = (catId: string): string[] => {
        const children = categories.filter(c => c.parent_category_id === catId).map(c => c.id);
        let descendants = [...children];
        for (const childId of children) {
            descendants = [...descendants, ...getDescendants(childId)];
        }
        return descendants;
    };

    // Only consider links with the same variant_product_id — (P, null) and (P, V1) are distinct items
    const existingAssignments = categoryProducts.filter(
        cp => cp.product_id === productId && cp.variant_product_id === variantProductId
    );
    if (existingAssignments.length === 0) return null;

    const targetAncestors = getAncestors(categoryId);
    const targetDescendants = getDescendants(categoryId);

    for (const assignment of existingAssignments) {
        if (assignment.category_id === categoryId) {
            return "Il prodotto è già presente in questa categoria.";
        }
        if (targetAncestors.includes(assignment.category_id)) {
            const cat = categories.find(c => c.id === assignment.category_id);
            return `Non puoi aggiungere questo prodotto qui, in quanto è già presente in una categoria genitore ("${cat?.name}").`;
        }
        if (targetDescendants.includes(assignment.category_id)) {
            const cat = categories.find(c => c.id === assignment.category_id);
            return `Non puoi aggiungere questo prodotto qui, in quanto è già presente in una sotto-categoria figlia ("${cat?.name}").`;
        }
    }
    return null;
}

type ProductRow = {
    id: string;
    linkId: string;
    productId: string;
    name: string;
    sku: string | null;
    price: number | null;
    from_price: number | null;
    isVariant: boolean;
    isGroupChild: boolean; // true when a variant row with a parent row above it in the same group
    hasVariants: boolean; // true for a parent row that has at least one variant link in this category
};

type ProductAttributeValueRow = {
    product_id: string;
    attribute_definition_id: string;
    value_text: string | null;
};

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

function getMaxDepthBelow(categoryId: string, allCategories: V2CatalogCategory[]): number {
    const children = allCategories.filter(c => c.parent_category_id === categoryId);
    if (children.length === 0) return 0;
    return 1 + Math.max(...children.map(c => getMaxDepthBelow(c.id, allCategories)));
}

function flattenTreeDFS(nodes: CatalogTreeNodeData[]): CatalogTreeNodeData[] {
    const result: CatalogTreeNodeData[] = [];
    for (const node of nodes) {
        result.push(node);
        if (node.children.length > 0) {
            result.push(...flattenTreeDFS(node.children));
        }
    }
    return result;
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
    const currentTenantId = useTenantId();
    const { showToast } = useToast();
    const { catalogLabel } = useVerticalConfig();

    const selectedCategoryId = searchParams.get("categoryId");

    const [catalog, setCatalog] = useState<V2Catalog | null>(null);
    const [categories, setCategories] = useState<V2CatalogCategory[]>([]);
    const [categoryProducts, setCategoryProducts] = useState<V2CatalogCategoryProduct[]>([]);
    const [allProducts, setAllProducts] = useState<V2Product[]>([]);

    const [skuByProductId, setSkuByProductId] = useState<Record<string, string>>({});
    const [formatPriceByProductId, setFormatPriceByProductId] = useState<Record<string, number>>({});
    const [formatsCountByProductId, setFormatsCountByProductId] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set());

    const [originalCategories, setOriginalCategories] = useState<V2CatalogCategory[]>([]);
    const [originalCategoryProducts, setOriginalCategoryProducts] = useState<
        V2CatalogCategoryProduct[]
    >([]);
    const [isDirty, setIsDirty] = useState(false);
    const [isSavingChanges, setIsSavingChanges] = useState(false);

    const [productSearch, setProductSearch] = useState("");

    const [isCategoryDrawerOpen, setIsCategoryDrawerOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<V2CatalogCategory | null>(null);
    const [categoryName, setCategoryName] = useState("");
    const [categoryParentId, setCategoryParentId] = useState("");

    // Unified Add Product Drawer
    const [isUnifiedAddProductDrawerOpen, setIsUnifiedAddProductDrawerOpen] = useState(false);
    const [addProductMode, setAddProductMode] = useState<"existing" | "new">("new");
    const [isSavingProduct, setIsSavingProduct] = useState(false);
    const [createIntent, setCreateIntent] = useState<CreateIntent>("associate");
    const [lastCreatedProduct, setLastCreatedProduct] = useState<V2Product | null>(null);
    const [newlyAddedProductId, setNewlyAddedProductId] = useState<string | null>(null);
    const productListRef = useRef<HTMLDivElement>(null);

    // Inline edit state (drawer "Aggiungi prodotto" — tab Esistente)
    const [editingProduct, setEditingProduct] = useState<V2Product | null>(null);
    const [isEditingReadOnly, setIsEditingReadOnly] = useState(false);
    const [isSavingEditProduct, setIsSavingEditProduct] = useState(false);

    // Main-table edit/remove state
    const [mainEditProduct, setMainEditProduct] = useState<V2Product | null>(null);
    const [isSavingMainEdit, setIsSavingMainEdit] = useState(false);
    const [productToRemoveFromCategory, setProductToRemoveFromCategory] = useState<ProductRow | null>(null);

    const [isSavingCategory, setIsSavingCategory] = useState(false);
    const [categoryToDelete, setCategoryToDelete] = useState<V2CatalogCategory | null>(null);
    const [isDeletingCategory, setIsDeletingCategory] = useState(false);

    const [assignProductSearch, setAssignProductSearch] = useState("");
    const [assignSelectedIds, setAssignSelectedIds] = useState<string[]>([]);
    const [assignInitialIds, setAssignInitialIds] = useState<Set<string>>(new Set());
    const [expandedProductGroupIds, setExpandedProductGroupIds] = useState<Set<string>>(new Set());
    const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
    const [productGroupMap, setProductGroupMap] = useState<Map<string, string[]>>(new Map());
    const [assignGroupId, setAssignGroupId] = useState<string | null>(null);

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
            { label: catalogLabel, to: `/business/${currentTenantId}/catalogs` },
            { label: catalog?.name || "—" }
        ],
        [catalog?.name, catalogLabel, currentTenantId]
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
        // Group links by product_id, preserving the natural sort order
        const groupOrder: string[] = [];
        const groupMap = new Map<string, V2CatalogCategoryProduct[]>();
        for (const link of selectedCategoryLinks) {
            if (!groupMap.has(link.product_id)) {
                groupOrder.push(link.product_id);
                groupMap.set(link.product_id, []);
            }
            groupMap.get(link.product_id)!.push(link);
        }

        const rows: ProductRow[] = [];
        for (const productId of groupOrder) {
            const links = groupMap.get(productId)!;
            const parentLink = links.find(l => l.variant_product_id === null) ?? null;
            const variantLinks = links.filter(l => l.variant_product_id !== null);

            // Render parent row first (if present)
            if (parentLink) {
                const parentProduct = productById.get(productId);
                rows.push({
                    id: parentLink.id,
                    linkId: parentLink.id,
                    productId,
                    name: parentProduct?.name ?? "Prodotto sconosciuto",
                    sku: skuByProductId[productId] ?? null,
                    price: (formatsCountByProductId[productId] ?? 0) === 1
                        ? (formatPriceByProductId[productId] ?? null)
                        : (parentProduct?.base_price ?? null),
                    from_price: (formatsCountByProductId[productId] ?? 0) > 1
                        ? (formatPriceByProductId[productId] ?? null)
                        : null,
                    isVariant: false,
                    isGroupChild: false,
                    hasVariants: variantLinks.length > 0
                });
            }

            // Render variant rows: indented when a parent exists, standalone otherwise
            for (const vLink of variantLinks) {
                const varProduct = productById.get(vLink.variant_product_id!);
                rows.push({
                    id: vLink.id,
                    linkId: vLink.id,
                    productId,
                    name: varProduct?.name ?? "Variante sconosciuta",
                    sku: skuByProductId[vLink.variant_product_id!] ?? null,
                    price: vLink.variant_product_id && (formatsCountByProductId[vLink.variant_product_id] ?? 0) === 1
                        ? (formatPriceByProductId[vLink.variant_product_id] ?? null)
                        : (varProduct?.base_price ?? null),
                    from_price: vLink.variant_product_id && (formatsCountByProductId[vLink.variant_product_id] ?? 0) > 1
                        ? (formatPriceByProductId[vLink.variant_product_id] ?? null)
                        : null,
                    isVariant: true,
                    isGroupChild: parentLink !== null,
                    hasVariants: false
                });
            }
        }
        return rows;
    }, [productById, selectedCategoryLinks, skuByProductId, formatPriceByProductId, formatsCountByProductId]);

    const filteredRows = useMemo(() => {
        const normalizedSearch = productSearch.trim().toLowerCase();
        if (!normalizedSearch) return productRows;

        const matchingProductIds = new Set<string>();
        for (const row of productRows) {
            if (`${row.name} ${row.sku ?? ""}`.toLowerCase().includes(normalizedSearch)) {
                matchingProductIds.add(row.productId);
            }
        }
        return productRows.filter(row => matchingProductIds.has(row.productId));
    }, [productRows, productSearch]);

    const visibleRows = useMemo(() => {
        return filteredRows.filter(row => {
            if (!row.isGroupChild) return true;
            return expandedProductGroupIds.has(row.productId);
        });
    }, [filteredRows, expandedProductGroupIds]);

    const inheritedProductIds = useMemo((): Set<string> => {
        if (!selectedCategoryId) return new Set();
        const parentMap = new Map(categories.map(c => [c.id, c.parent_category_id]));
        const ancestors = new Set<string>();
        let current = parentMap.get(selectedCategoryId);
        while (current) {
            ancestors.add(current);
            current = parentMap.get(current);
        }
        if (ancestors.size === 0) return new Set();
        const inherited = new Set<string>();
        for (const cp of categoryProducts) {
            if (ancestors.has(cp.category_id) && cp.variant_product_id === null) {
                inherited.add(cp.product_id);
            }
        }
        return inherited;
    }, [categories, categoryProducts, selectedCategoryId]);

    const assignHasChanges = useMemo(() => {
        if (assignSelectedIds.some(id => !assignInitialIds.has(id))) return true;
        for (const id of assignInitialIds) {
            if (!assignSelectedIds.includes(id)) return true;
        }
        return false;
    }, [assignSelectedIds, assignInitialIds]);

    const assignableProducts = useMemo(() => {
        const normalizedSearch = assignProductSearch.trim().toLowerCase();
        return allProducts.filter(product => {
            if (normalizedSearch && !product.name.toLowerCase().includes(normalizedSearch)) return false;
            if (assignGroupId) {
                const groups = productGroupMap.get(product.id) ?? [];
                if (!groups.includes(assignGroupId)) return false;
            }
            return true;
        });
    }, [allProducts, assignProductSearch, assignGroupId, productGroupMap]);


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
                    .from("product_attribute_values")
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
                    .from("catalogs")
                    .select("*")
                    .eq("id", catalogId)
                    .eq("tenant_id", currentTenantId)
                    .single(),
                listCategories(currentTenantId, catalogId),
                listCategoryProducts(currentTenantId, catalogId),
                listBaseProductsWithVariants(currentTenantId),
                getProductGroups(currentTenantId),
                supabase
                    .from("product_group_items")
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
            setOriginalCategories(loadedCategories);
            setCategoryProducts(loadedLinks);
            setOriginalCategoryProducts(loadedLinks);
            setAllProducts(loadedProducts);
            setProductGroups(loadedGroups);
            setProductGroupMap(nextGroupMap);
            setIsDirty(false);

            // Load format prices using the freshly fetched products list
            try {
                const allIds = loadedProducts.flatMap(p => [
                    p.id,
                    ...(p.variants?.map(v => v.id) ?? [])
                ]);
                if (allIds.length > 0) {
                    const metadata = await getProductListMetadata(currentTenantId, allIds);
                    const nextFormatPrices: Record<string, number> = {};
                    const nextFormatCounts: Record<string, number> = {};
                    for (const [id, meta] of Object.entries(metadata)) {
                        if (typeof meta.fromPrice === "number") {
                            nextFormatPrices[id] = meta.fromPrice;
                        }
                        if (meta.formatsCount > 0) {
                            nextFormatCounts[id] = meta.formatsCount;
                        }
                    }
                    setFormatPriceByProductId(nextFormatPrices);
                    setFormatsCountByProductId(nextFormatCounts);
                }
            } catch (error) {
                console.warn("Impossibile caricare prezzi formato prodotti:", error);
            }

            await loadProductMetadata();
        } catch (error) {
            console.error(error);
            showToast({ message: "Errore durante il caricamento del catalogo.", type: "error" });
            navigate(`/business/${currentTenantId}/catalogs`);
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
        setEditingProduct(null);
        setIsEditingReadOnly(false);
        setAssignSelectedIds([]);
        setAssignInitialIds(new Set());
        setExpandedProductGroupIds(new Set());
        setAssignGroupId(null);
        setAssignProductSearch("");
    }, [selectedCategoryId]);

    // Initialize selection snapshot when the "Esistente" tab drawer opens
    useEffect(() => {
        if (!isUnifiedAddProductDrawerOpen || !selectedCategoryId) return;
        const ids = categoryProducts
            .filter(cp => cp.category_id === selectedCategoryId && cp.variant_product_id === null)
            .map(cp => cp.product_id);
        setAssignInitialIds(new Set(ids));
        setAssignSelectedIds(ids);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isUnifiedAddProductDrawerOpen]);

    const createParentOptions = useMemo(() => {
        const options = [{ value: "", label: "Nessuna (categoria principale)" }];
        for (const node of flattenTreeDFS(tree)) {
            if (node.level >= 3) continue;
            const prefix = "-- ".repeat(node.level - 1);
            options.push({ value: node.id, label: `${prefix}${node.name}` });
        }
        return options;
    }, [tree]);

    const editParentOptions = useMemo(() => {
        if (!editingCategory) return createParentOptions;

        const childrenMap = buildChildrenMap(categories);
        const descendantIds = new Set(collectDescendantIds(editingCategory.id, childrenMap));
        const maxDepthBelow = getMaxDepthBelow(editingCategory.id, categories);

        const options: { value: string; label: string }[] = [
            { value: "", label: "Nessuna (categoria principale)" }
        ];

        for (const node of flattenTreeDFS(tree)) {
            if (node.id === editingCategory.id) continue;
            if (descendantIds.has(node.id)) continue;
            if (node.level >= 3) continue;
            if (node.level + 1 + maxDepthBelow > 3) continue;
            const prefix = "-- ".repeat(node.level - 1);
            options.push({ value: node.id, label: `${prefix}${node.name}` });
        }

        return options;
    }, [editingCategory, categories, tree, createParentOptions]);

    const editParentDepthFiltered = useMemo((): boolean => {
        if (!editingCategory) return false;
        const childrenMap = buildChildrenMap(categories);
        const descendantIds = new Set(collectDescendantIds(editingCategory.id, childrenMap));
        const maxDepthBelow = getMaxDepthBelow(editingCategory.id, categories);
        if (maxDepthBelow === 0) return false;
        return flattenTreeDFS(tree).some(
            node =>
                node.id !== editingCategory.id &&
                !descendantIds.has(node.id) &&
                node.level < 3 &&
                node.level + 1 + maxDepthBelow > 3
        );
    }, [editingCategory, categories, tree]);

    const openCreateRootCategoryDrawer = useCallback(() => {
        if (isDirty) {
            showToast({
                message: "Salva o annulla le modifiche prima di creare o eliminare categorie.",
                type: "info"
            });
            return;
        }
        setEditingCategory(null);
        setCategoryName("");
        setCategoryParentId("");
        setIsCategoryDrawerOpen(true);
    }, [isDirty, showToast]);

    const openCreateSubCategoryDrawer = useCallback(
        (parentCategoryId: string) => {
            if (isDirty) {
                showToast({
                    message: "Salva o annulla le modifiche prima di creare o eliminare categorie.",
                    type: "info"
                });
                return;
            }

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
        [categoriesById, isDirty, showToast]
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
            if (isDirty) {
                showToast({
                    message: "Salva o annulla le modifiche prima di creare o eliminare categorie.",
                    type: "info"
                });
                return;
            }
            const category = categoriesById.get(categoryId);
            if (!category) return;
            setCategoryToDelete(category);
        },
        [categoriesById, isDirty, showToast]
    );

    const handleSaveCategory = useCallback(
        async (event: React.FormEvent) => {
            event.preventDefault();
            if (!currentTenantId || !catalogId) return;

            if (!categoryName.trim()) {
                showToast({ message: "Il nome della categoria è obbligatorio.", type: "error" });
                return;
            }

            if (editingCategory) {
                const newParentId = categoryParentId || null;
                const parentChanged = newParentId !== (editingCategory.parent_category_id ?? null);

                if (!parentChanged) {
                    // Only name changed — optimistic update
                    setCategories(prev =>
                        prev.map(cat =>
                            cat.id === editingCategory.id ? { ...cat, name: categoryName.trim() } : cat
                        )
                    );
                    setIsDirty(true);
                    setIsCategoryDrawerOpen(false);
                    return;
                }

                // Parent changed — save immediately
                if (isDirty) {
                    showToast({
                        message: "Salva o annulla le modifiche prima di spostare la categoria.",
                        type: "info"
                    });
                    return;
                }

                setIsSavingCategory(true);
                try {
                    const parentCategory = newParentId ? (categoriesById.get(newParentId) ?? null) : null;
                    const newLevel = parentCategory ? ((parentCategory.level + 1) as 1 | 2 | 3) : 1;

                    const newSiblings = categories.filter(
                        c => c.parent_category_id === newParentId && c.id !== editingCategory.id
                    );
                    const newSortOrder =
                        newSiblings.length > 0
                            ? Math.max(...newSiblings.map(c => c.sort_order)) + 10
                            : 0;

                    await updateCategory(editingCategory.id, currentTenantId, {
                        name: categoryName.trim(),
                        parent_category_id: newParentId,
                        level: newLevel,
                        sort_order: newSortOrder
                    });

                    const levelDiff = newLevel - editingCategory.level;
                    if (levelDiff !== 0) {
                        const childrenMap = buildChildrenMap(categories);
                        const descendantIds = collectDescendantIds(editingCategory.id, childrenMap);
                        await Promise.all(
                            descendantIds.map(descId => {
                                const desc = categoriesById.get(descId);
                                if (!desc) return Promise.resolve();
                                const newDescLevel = (desc.level + levelDiff) as 1 | 2 | 3;
                                return updateCategory(descId, currentTenantId, { level: newDescLevel });
                            })
                        );
                    }

                    showToast({ message: "Categoria spostata.", type: "success" });
                    setIsCategoryDrawerOpen(false);
                    await loadData();
                } catch (error: unknown) {
                    console.error(error);
                    showToast({
                        message: getErrorMessage(error, "Errore spostamento categoria."),
                        type: "error"
                    });
                } finally {
                    setIsSavingCategory(false);
                }
                return;
            }

            setIsSavingCategory(true);
            try {
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
            categories,
            categoriesById,
            categoryName,
            categoryParentId,
            currentTenantId,
            editingCategory,
            getNextSortOrder,
            isDirty,
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
        async (_parentCategoryId: string | null, orderedSiblingIds: string[]) => {
            if (orderedSiblingIds.length === 0) return;

            setCategories(prev => {
                const next = [...prev];
                orderedSiblingIds.forEach((categoryId, index) => {
                    const i = next.findIndex(c => c.id === categoryId);
                    if (i >= 0) next[i] = { ...next[i], sort_order: index * 10 };
                });
                return next;
            });
            setIsDirty(true);
        },
        []
    );

    const handleReparent = useCallback(
        async (
            categoryId: string,
            targetId: string,
            position: "before" | "after" | "inside"
        ) => {
            if (!currentTenantId) return;
            const activeCategory = categoriesById.get(categoryId);
            const targetCategory = categoriesById.get(targetId);
            if (!activeCategory || !targetCategory) return;

            const newParentId: string | null =
                position === "inside" ? targetId : (targetCategory.parent_category_id ?? null);

            const parentCat = newParentId ? (categoriesById.get(newParentId) ?? null) : null;
            const newLevel = (parentCat ? parentCat.level + 1 : 1) as 1 | 2 | 3;

            let newSortOrder: number;
            let siblingIdsToNormalize: string[] = [];

            if (position === "inside") {
                const existingChildren = categories
                    .filter(
                        c => c.parent_category_id === newParentId && c.id !== categoryId
                    )
                    .sort((a, b) => a.sort_order - b.sort_order);
                newSortOrder =
                    existingChildren.length > 0
                        ? existingChildren[existingChildren.length - 1].sort_order + 10
                        : 0;
            } else {
                const newSiblings = categories
                    .filter(
                        c => c.parent_category_id === newParentId && c.id !== categoryId
                    )
                    .sort(
                        (a, b) =>
                            a.sort_order - b.sort_order ||
                            a.created_at.localeCompare(b.created_at)
                    );
                const targetIndex = newSiblings.findIndex(c => c.id === targetId);
                const insertAt =
                    position === "before"
                        ? Math.max(0, targetIndex)
                        : targetIndex + 1;

                const orderedIds = [
                    ...newSiblings.slice(0, insertAt).map(c => c.id),
                    categoryId,
                    ...newSiblings.slice(insertAt).map(c => c.id)
                ];
                newSortOrder = insertAt * 10;
                siblingIdsToNormalize = orderedIds;
            }

            try {
                await reparentCategory(
                    categoryId,
                    currentTenantId,
                    newParentId,
                    newLevel,
                    newSortOrder
                );

                const levelDiff = newLevel - activeCategory.level;
                if (levelDiff !== 0) {
                    await updateDescendantLevels(
                        categoryId,
                        currentTenantId,
                        levelDiff,
                        categories
                    );
                }

                if (siblingIdsToNormalize.length > 0) {
                    await Promise.all(
                        siblingIdsToNormalize.map((id, idx) => {
                            if (id === categoryId) return Promise.resolve();
                            const existing = categoriesById.get(id);
                            if (!existing || existing.sort_order === idx * 10)
                                return Promise.resolve();
                            return updateCategory(id, currentTenantId, {
                                sort_order: idx * 10
                            });
                        })
                    );
                }

                await loadData();
                showToast({ message: "Categoria spostata.", type: "success" });
            } catch (error: unknown) {
                console.error(error);
                showToast({
                    message: getErrorMessage(error, "Errore spostamento categoria."),
                    type: "error"
                });
            }
        },
        [categories, categoriesById, currentTenantId, loadData, showToast]
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

    const handleReorderProducts = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id || !selectedCategoryId) return;

            const oldIndex = filteredRows.findIndex(row => row.id === active.id);
            const newIndex = filteredRows.findIndex(row => row.id === over.id);

            if (oldIndex < 0 || newIndex < 0) return;

            const reordered = arrayMove(filteredRows, oldIndex, newIndex);
            const nextLinks = [...categoryProducts];

            reordered.forEach((row, index) => {
                const linkIndex = nextLinks.findIndex(l => l.id === row.id);
                if (linkIndex >= 0) {
                    nextLinks[linkIndex] = { ...nextLinks[linkIndex], sort_order: index * 10 };
                }
            });

            setCategoryProducts(nextLinks);
            setIsDirty(true);
        },
        [filteredRows, selectedCategoryId, categoryProducts]
    );

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor)
    );

    const handleAssignExistingProduct = useCallback(
        (productId: string) => {
            if (!currentTenantId || !catalogId || !selectedCategoryId) return;

            const validationError = validateProductAddition(
                selectedCategoryId,
                productId,
                null,
                categories,
                categoryProducts
            );
            if (validationError) {
                showToast({ message: validationError, type: "error" });
                return;
            }

            const nextSortOrder =
                selectedCategoryLinks.length > 0
                    ? Math.max(...selectedCategoryLinks.map(link => link.sort_order)) + 10
                    : 0;

            const localLink: V2CatalogCategoryProduct = {
                id: `${LOCAL_LINK_PREFIX}${selectedCategoryId}_${productId}`,
                tenant_id: currentTenantId,
                catalog_id: catalogId,
                category_id: selectedCategoryId,
                product_id: productId,
                variant_product_id: null,
                sort_order: nextSortOrder,
                created_at: new Date().toISOString()
            };

            setCategoryProducts(prev => [...prev, localLink]);
            setIsDirty(true);
        },
        [
            catalogId,
            categories,
            categoryProducts,
            currentTenantId,
            selectedCategoryId,
            selectedCategoryLinks,
            showToast
        ]
    );

    const handleBulkAssignItems = useCallback(() => {
        if (!currentTenantId || !catalogId || !selectedCategoryId) return;

        const currentCategoryLinks = categoryProducts.filter(
            cp => cp.category_id === selectedCategoryId && cp.variant_product_id === null
        );
        const currentProductIds = new Set(currentCategoryLinks.map(cp => cp.product_id));
        const selectedSet = new Set(assignSelectedIds);

        const toAdd = assignSelectedIds.filter(id => !currentProductIds.has(id));
        const toRemove = currentCategoryLinks.filter(cp => !selectedSet.has(cp.product_id));

        if (toAdd.length === 0 && toRemove.length === 0) {
            setIsUnifiedAddProductDrawerOpen(false);
            return;
        }

        const currentMaxOrder =
            currentCategoryLinks.length > 0
                ? Math.max(...currentCategoryLinks.map(l => l.sort_order))
                : -10;

        const newLinks: V2CatalogCategoryProduct[] = toAdd.map((productId, i) => ({
            id: `${LOCAL_LINK_PREFIX}${selectedCategoryId}_${productId}_parent`,
            tenant_id: currentTenantId,
            catalog_id: catalogId,
            category_id: selectedCategoryId,
            product_id: productId,
            variant_product_id: null,
            sort_order: currentMaxOrder + (i + 1) * 10,
            created_at: new Date().toISOString()
        }));

        const removeIds = new Set(toRemove.map(cp => cp.id));

        setCategoryProducts(prev => [
            ...prev.filter(cp => !removeIds.has(cp.id)),
            ...newLinks
        ]);
        setIsDirty(true);

        const msgs: string[] = [];
        if (toAdd.length > 0) msgs.push(`${toAdd.length} ${toAdd.length === 1 ? "prodotto associato" : "prodotti associati"}`);
        if (toRemove.length > 0) msgs.push(`${toRemove.length} ${toRemove.length === 1 ? "rimosso" : "rimossi"}`);
        showToast({ message: msgs.join(", ") + ".", type: "success" });

        setAssignSelectedIds([]);
        setAssignInitialIds(new Set());
        setIsUnifiedAddProductDrawerOpen(false);
    }, [
        assignSelectedIds, catalogId, categoryProducts,
        currentTenantId, selectedCategoryId, showToast
    ]);

    const handleInlineEditSuccess = useCallback((updatedProduct?: V2Product) => {
        if (updatedProduct) {
            setAllProducts(prev =>
                prev.map(p => p.id === updatedProduct.id ? { ...p, ...updatedProduct } : p)
            );
        }
        setEditingProduct(null);
        setIsEditingReadOnly(false);
    }, []);

    const handleMainEditSuccess = useCallback((updatedProduct?: V2Product) => {
        if (updatedProduct) {
            setAllProducts(prev =>
                prev.map(p => p.id === updatedProduct.id ? { ...p, ...updatedProduct } : p)
            );
        }
        setMainEditProduct(null);
    }, []);

    const handleRemoveFromCategory = useCallback(() => {
        if (!productToRemoveFromCategory) return;
        setCategoryProducts(prev =>
            prev.filter(cp => cp.id !== productToRemoveFromCategory.linkId)
        );
        setIsDirty(true);
        showToast({
            message: `"${productToRemoveFromCategory.name}" rimosso dalla categoria.`,
            type: "success"
        });
        setProductToRemoveFromCategory(null);
    }, [productToRemoveFromCategory, showToast]);

    const handleProductCreated = useCallback(
        (createdProduct?: V2Product) => {
            if (!currentTenantId || !catalogId || !selectedCategoryId || !createdProduct) {
                void loadData();
                return;
            }

            const currentLinks = categoryProducts.filter(
                link => link.category_id === selectedCategoryId
            );
            const nextSortOrder =
                currentLinks.length > 0
                    ? Math.max(...currentLinks.map(link => link.sort_order)) + 10
                    : 0;

            const localLink: V2CatalogCategoryProduct = {
                id: `${LOCAL_LINK_PREFIX}${selectedCategoryId}_${createdProduct.id}`,
                tenant_id: currentTenantId,
                catalog_id: catalogId,
                category_id: selectedCategoryId,
                product_id: createdProduct.id,
                variant_product_id: null,
                sort_order: nextSortOrder,
                created_at: new Date().toISOString()
            };

            setAllProducts(prev => [...prev, createdProduct]);
            setCategoryProducts(prev => [...prev, localLink]);
            setIsDirty(true);
            setLastCreatedProduct(createdProduct);
            setIsUnifiedAddProductDrawerOpen(false);
        },
        [catalogId, categoryProducts, currentTenantId, loadData, selectedCategoryId]
    );

    // Post-create: show toast (associate only) or navigate (configure)
    useEffect(() => {
        if (!lastCreatedProduct) return;
        const product = lastCreatedProduct;
        const intent = createIntent;
        setLastCreatedProduct(null);
        setCreateIntent("associate");

        if (intent === "configure") {
            navigate(`/business/${currentTenantId}/products/${product.id}?tab=pricing`, {
                state: { from: "catalog", categoryId: selectedCategoryId }
            });
        } else {
            setNewlyAddedProductId(product.id);
            showToast({
                message: "Prodotto creato. Completa prezzi e configurazioni quando vuoi.",
                type: "success",
                actionLabel: "Configura ora",
                onAction: () =>
                    navigate(`/business/${currentTenantId}/products/${product.id}`, {
                        state: { from: "catalog", categoryId: selectedCategoryId }
                    })
            });
        }
    }, [
        lastCreatedProduct,
        createIntent,
        navigate,
        showToast,
        currentTenantId,
        selectedCategoryId
    ]);

    // Auto-clear row highlight after 2 s
    useEffect(() => {
        if (!newlyAddedProductId) return;
        const timer = setTimeout(() => setNewlyAddedProductId(null), 2000);
        return () => clearTimeout(timer);
    }, [newlyAddedProductId]);

    // Scroll newly added product row into view
    useEffect(() => {
        if (!newlyAddedProductId) return;
        requestAnimationFrame(() => {
            const el = productListRef.current?.querySelector(`.${styles.rowNewlyAdded}`);
            el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
    }, [newlyAddedProductId]);

    const handleBulkRemoveSelected = useCallback((selectedIds: string[]) => {
        if (selectedIds.length === 0) return;
        const idsSet = new Set(selectedIds);
        setCategoryProducts(prev => prev.filter(link => !idsSet.has(link.id)));
        setIsDirty(true);
    }, []);

    const handleCancelChanges = useCallback(() => {
        setCategories(originalCategories);
        setCategoryProducts(originalCategoryProducts);
        setIsDirty(false);
    }, [originalCategories, originalCategoryProducts]);

    const saveCatalogChanges = useCallback(async () => {
        if (!currentTenantId || !catalogId) return;
        setIsSavingChanges(true);

        try {
            // 1. Category name + sort_order changes
            const originalCatMap = new Map(originalCategories.map(c => [c.id, c]));
            const categoryUpdates: Array<{
                id: string;
                updates: { name?: string; sort_order?: number };
            }> = [];
            for (const cat of categories) {
                const orig = originalCatMap.get(cat.id);
                if (!orig) continue;
                const updates: { name?: string; sort_order?: number } = {};
                if (orig.name !== cat.name) updates.name = cat.name;
                if (orig.sort_order !== cat.sort_order) updates.sort_order = cat.sort_order;
                if (Object.keys(updates).length > 0) categoryUpdates.push({ id: cat.id, updates });
            }

            // 2. New product links (synthetic IDs)
            const addedLinks = categoryProducts.filter(l => l.id.startsWith(LOCAL_LINK_PREFIX));

            // 3. Removed real product links
            const currentLinkIds = new Set(categoryProducts.map(l => l.id));
            const removedLinkIds = originalCategoryProducts
                .filter(l => !currentLinkIds.has(l.id))
                .map(l => l.id);

            // 4. Reordered real product links
            const origLinkMap = new Map(originalCategoryProducts.map(l => [l.id, l]));
            const reorderedLinks = categoryProducts.filter(l => {
                if (l.id.startsWith(LOCAL_LINK_PREFIX)) return false;
                const orig = origLinkMap.get(l.id);
                return orig !== undefined && orig.sort_order !== l.sort_order;
            });


            // Execute in parallel where safe
            await Promise.all([
                ...categoryUpdates.map(({ id, updates }) =>
                    updateCategory(id, currentTenantId, updates)
                ),
                ...removedLinkIds.map(linkId => removeProductFromCategory(currentTenantId, linkId)),
                ...reorderedLinks.map(link =>
                    updateProductSortOrder(link.id, currentTenantId, link.sort_order)
                )
            ]);

            // Add new links sequentially (respects anti-duplication on DB side)
            for (const link of addedLinks) {
                await addProductToCategory(
                    currentTenantId,
                    catalogId,
                    link.category_id,
                    link.product_id,
                    link.sort_order,
                    link.variant_product_id
                );
            }

            showToast({ message: "Modifiche salvate con successo.", type: "success" });
            await loadData();
        } catch (error) {
            console.error(error);
            showToast({
                message: getErrorMessage(error, "Errore durante il salvataggio delle modifiche."),
                type: "error"
            });
        } finally {
            setIsSavingChanges(false);
        }
    }, [
        catalogId,
        categories,
        categoryProducts,
        currentTenantId,
        loadData,
        originalCategories,
        originalCategoryProducts,
        showToast
    ]);

    const columns = useMemo<ColumnDefinition<ProductRow>[]>(
        () => [
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
                    <div
                        className={styles.productNameCell}
                        style={row.isGroupChild ? { paddingLeft: 20 } : undefined}
                    >
                        <div className={styles.productNameRow}>
                            {!row.isVariant && row.hasVariants ? (
                                <button
                                    type="button"
                                    className={styles.productExpandBtn}
                                    onClick={e => {
                                        e.stopPropagation();
                                        setExpandedProductGroupIds(prev => {
                                            const next = new Set(prev);
                                            if (next.has(row.productId)) next.delete(row.productId);
                                            else next.add(row.productId);
                                            return next;
                                        });
                                    }}
                                >
                                    {expandedProductGroupIds.has(row.productId)
                                        ? <IconChevronDown size={14} />
                                        : <IconChevronRight size={14} />}
                                </button>
                            ) : (
                                <span className={styles.productExpandSpacer} />
                            )}
                            <Text variant="body-sm" weight={600} className={styles.productNameMain}>
                                {row.name}
                            </Text>
                            {row.isVariant && <Badge variant="secondary">Variante</Badge>}
                            {row.price === null && row.from_price === null && <Badge variant="warning">Da configurare</Badge>}
                        </div>
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
                accessor: row => row.id,
                cell: (_value, row) => <Text variant="body-sm">{getDisplayPrice({ base_price: row.price, from_price: row.from_price }).label}</Text>
            },
            {
                id: "actions",
                header: "",
                width: "44px",
                align: "right",
                cell: (_value, row) => (
                    <div data-row-click-ignore="true">
                        <DropdownMenu
                            trigger={
                                <button type="button" className={styles.assignActionsBtn}>
                                    <IconDotsVertical size={15} />
                                </button>
                            }
                            placement="bottom-end"
                        >
                            <DropdownItem
                                onClick={() => {
                                    const product = allProducts.find(p => p.id === row.productId) ?? null;
                                    setMainEditProduct(product);
                                }}
                            >
                                Modifica
                            </DropdownItem>
                            <DropdownItem
                                href={`/business/${currentTenantId}/products/${row.productId}`}
                                target="_blank"
                            >
                                Apri in Piatti
                            </DropdownItem>
                            <DropdownItem
                                danger
                                onClick={() => setProductToRemoveFromCategory(row)}
                            >
                                Rimuovi dalla categoria
                            </DropdownItem>
                        </DropdownMenu>
                    </div>
                )
            }
        ],
        [allProducts, currentTenantId, expandedProductGroupIds]
    );

    const assignColumns = useMemo<ColumnDefinition<V2Product>[]>(() => {
        const selectableIds = assignableProducts
            .filter(p => !inheritedProductIds.has(p.id))
            .map(p => p.id);
        const allSelected =
            selectableIds.length > 0 && selectableIds.every(id => assignSelectedIds.includes(id));
        const someSelected =
            !allSelected && selectableIds.some(id => assignSelectedIds.includes(id));

        return [
            {
                id: "select",
                header: (
                    <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el: HTMLInputElement | null) => {
                            if (el) el.indeterminate = someSelected;
                        }}
                        onChange={e => {
                            if (e.target.checked) {
                                setAssignSelectedIds(prev => {
                                    const next = new Set(prev);
                                    selectableIds.forEach(id => next.add(id));
                                    return Array.from(next);
                                });
                            } else {
                                setAssignSelectedIds(prev =>
                                    prev.filter(id => !selectableIds.includes(id))
                                );
                            }
                        }}
                        aria-label="Seleziona tutti"
                    />
                ),
                width: "48px",
                cell: (_value, row) => {
                    const isInherited = inheritedProductIds.has(row.id);
                    const isSelected = isInherited || assignSelectedIds.includes(row.id);
                    return (
                        <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isInherited}
                            onChange={e => {
                                setAssignSelectedIds(prev =>
                                    e.target.checked
                                        ? prev.includes(row.id) ? prev : [...prev, row.id]
                                        : prev.filter(id => id !== row.id)
                                );
                            }}
                            aria-label="Seleziona"
                        />
                    );
                }
            },
            {
                id: "name",
                header: "Prodotto",
                accessor: row => row.name,
                cell: (value, row) => (
                    <div className={styles.productNameCell}>
                        <Text variant="body-sm" weight={600}>
                            {String(value)}
                        </Text>
                        {inheritedProductIds.has(row.id) && (
                            <Text variant="caption" colorVariant="muted">
                                Ereditato dalla categoria padre
                            </Text>
                        )}
                    </div>
                )
            },
            {
                id: "price",
                header: "Prezzo",
                accessor: row => row.id,
                width: "100px",
                align: "right",
                cell: (_value, row) => (
                    <Text variant="body-sm" colorVariant="muted">
                        {getDisplayPrice({
                            base_price:
                                (formatsCountByProductId[row.id] ?? 0) === 1
                                    ? (formatPriceByProductId[row.id] ?? null)
                                    : row.base_price,
                            from_price:
                                (formatsCountByProductId[row.id] ?? 0) > 1
                                    ? (formatPriceByProductId[row.id] ?? null)
                                    : null
                        }).label}
                    </Text>
                )
            },
            {
                id: "actions",
                header: "",
                width: "44px",
                align: "right",
                cell: (_value, row) => {
                    const isInherited = inheritedProductIds.has(row.id);
                    return (
                        <div data-row-click-ignore="true">
                            <DropdownMenu
                                trigger={
                                    <button type="button" className={styles.assignActionsBtn}>
                                        <IconDotsVertical size={15} />
                                    </button>
                                }
                                placement="bottom-end"
                            >
                                {isInherited ? (
                                    <DropdownItem
                                        onClick={() => {
                                            setEditingProduct(row);
                                            setIsEditingReadOnly(true);
                                        }}
                                    >
                                        Visualizza dettaglio
                                    </DropdownItem>
                                ) : (
                                    <DropdownItem
                                        onClick={() => {
                                            setEditingProduct(row);
                                            setIsEditingReadOnly(false);
                                        }}
                                    >
                                        Modifica
                                    </DropdownItem>
                                )}
                                <DropdownItem
                                    href={`/business/${currentTenantId}/products/${row.id}`}
                                    target="_blank"
                                >
                                    Apri in Piatti
                                </DropdownItem>
                            </DropdownMenu>
                        </div>
                    );
                }
            }
        ];
    }, [
        assignableProducts,
        inheritedProductIds,
        assignSelectedIds,
        currentTenantId,
        formatPriceByProductId,
        formatsCountByProductId
    ]);

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
                                variant="primary"
                                onClick={() => {
                                    const saved = localStorage.getItem(
                                        `cg_product_drawer_last_tab_${currentTenantId}`
                                    );
                                    setAddProductMode(
                                        saved === "existing" || saved === "new" ? saved : "new"
                                    );
                                    setIsUnifiedAddProductDrawerOpen(true);
                                }}
                            >
                                + Aggiungi prodotto
                            </Button>
                        </div>
                    </div>

                    <div className={styles.productsTools}>
                        <div className={styles.quickSearchWrap}>
                            <SearchInput
                                value={productSearch}
                                onChange={event => setProductSearch(event.target.value)}
                                onClear={() => setProductSearch("")}
                                placeholder="Cerca prodotto..."
                            />
                        </div>
                    </div>
                </div>

                <div ref={productListRef} className={styles.tableCard}>
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleReorderProducts}
                    >
                        <SortableContext
                            items={visibleRows.map(r => r.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <DataTable<ProductRow>
                                data={visibleRows}
                                columns={columns}
                                rowsPerPage={20}
                                selectable
                                onBulkDelete={handleBulkRemoveSelected}
                                emptyState={
                                    <div style={{ padding: "24px" }}>
                                        <Text variant="body-sm" colorVariant="muted">
                                            {productSearch.trim()
                                                ? "Nessun prodotto corrisponde al filtro."
                                                : "Nessun prodotto associato a questa categoria."}
                                        </Text>
                                    </div>
                                }
                                rowClassName={row =>
                                    row.productId === newlyAddedProductId
                                        ? styles.rowNewlyAdded
                                        : undefined
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
                    title={catalog?.name || catalogLabel}
                    subtitle="Gestisci categorie e prodotti con navigazione ad albero."
                />
            </div>

            {isDirty && (
                <div className={styles.saveBar}>
                    <Text variant="body-sm" weight={600} className={styles.saveBarMessage}>
                        Hai modifiche non salvate
                    </Text>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleCancelChanges}
                        disabled={isSavingChanges}
                    >
                        Annulla modifiche
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={saveCatalogChanges}
                        loading={isSavingChanges}
                    >
                        Salva modifiche
                    </Button>
                </div>
            )}

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
                                onReparent={handleReparent}
                                isReordering={false}
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
                        <>
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
                        </>
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

                        <Select
                            label={editingCategory ? "Sposta sotto" : "Inserisci sotto"}
                            value={categoryParentId}
                            onChange={event => setCategoryParentId(event.target.value)}
                            options={editingCategory ? editParentOptions : createParentOptions}
                        />
                        <Text variant="caption" colorVariant="muted">
                            {editingCategory
                                ? "Sposta questa categoria all'interno di un'altra. Seleziona 'Nessuna' per renderla una categoria principale."
                                : "Seleziona la categoria all'interno della quale inserire questa nuova categoria. Lascia vuoto per crearla come categoria principale."}
                        </Text>
                        {editingCategory && editParentDepthFiltered && (
                            <Text variant="caption" colorVariant="muted">
                                Alcune categorie non sono disponibili perché supererebbero il limite di 3 livelli di profondità.
                            </Text>
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
                        <>
                            <Button
                                variant="secondary"
                                onClick={() => setCategoryToDelete(null)}
                                disabled={isDeletingCategory}
                            >
                                Annulla
                            </Button>
                            <Button
                                variant="danger"
                                onClick={handleDeleteCategory}
                                loading={isDeletingCategory}
                            >
                                Elimina
                            </Button>
                        </>
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
                open={isUnifiedAddProductDrawerOpen}
                onClose={() => {
                    setIsUnifiedAddProductDrawerOpen(false);
                    setEditingProduct(null);
                    setIsEditingReadOnly(false);
                    setAssignSelectedIds([]);
                    setAssignInitialIds(new Set());
                    setAssignGroupId(null);
                    setAssignProductSearch("");
                }}
                width={520}
            >
                <DrawerLayout
                    header={
                        editingProduct ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <button
                                    type="button"
                                    className={styles.assignBackBtn}
                                    onClick={() => {
                                        setEditingProduct(null);
                                        setIsEditingReadOnly(false);
                                    }}
                                >
                                    <IconArrowLeft size={13} />
                                    Aggiungi prodotto
                                </button>
                                <Text variant="title-sm" weight={700}>
                                    {isEditingReadOnly ? "Dettaglio" : "Modifica"}: {editingProduct.name}
                                </Text>
                                <Text variant="caption" colorVariant="muted">
                                    Categoria: {selectedCategory?.name ?? "—"}
                                </Text>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <div>
                                    <Text variant="title-sm" weight={700}>
                                        Aggiungi prodotto
                                    </Text>
                                    <Text variant="caption" colorVariant="muted">
                                        Categoria: {selectedCategory?.name ?? "—"}
                                    </Text>
                                </div>
                                <Tabs
                                    value={addProductMode}
                                    onChange={v => {
                                        const tab = v as "existing" | "new";
                                        setAddProductMode(tab);
                                        localStorage.setItem(
                                            `cg_product_drawer_last_tab_${currentTenantId}`,
                                            tab
                                        );
                                    }}
                                >
                                    <Tabs.List>
                                        <Tabs.Tab value="new">Nuovo</Tabs.Tab>
                                        <Tabs.Tab value="existing">Esistente</Tabs.Tab>
                                    </Tabs.List>
                                </Tabs>
                            </div>
                        )
                    }
                    footer={
                        editingProduct ? (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                        window.open(
                                            `/business/${currentTenantId}/products/${editingProduct.id}`,
                                            "_blank"
                                        )
                                    }
                                >
                                    Apri in Piatti →
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setEditingProduct(null);
                                        setIsEditingReadOnly(false);
                                    }}
                                >
                                    {isEditingReadOnly ? "Chiudi" : "Annulla"}
                                </Button>
                                {!isEditingReadOnly && (
                                    <Button
                                        variant="primary"
                                        type="submit"
                                        form="product-form-edit-inline"
                                        loading={isSavingEditProduct}
                                        disabled={isSavingEditProduct}
                                    >
                                        Salva modifiche
                                    </Button>
                                )}
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="secondary"
                                    onClick={() => setIsUnifiedAddProductDrawerOpen(false)}
                                >
                                    Annulla
                                </Button>
                                {addProductMode === "existing" ? (
                                    <Button
                                        variant="primary"
                                        onClick={handleBulkAssignItems}
                                        disabled={!assignHasChanges}
                                    >
                                        Associa selezionati ({assignSelectedIds.length})
                                    </Button>
                                ) : (
                                    <SplitButton
                                        primaryLabel="Crea e associa"
                                        loading={isSavingProduct}
                                        onPrimaryClick={() => {
                                            setCreateIntent("associate");
                                            const form = document.getElementById(
                                                "product-form-unified"
                                            ) as HTMLFormElement | null;
                                            form?.requestSubmit();
                                        }}
                                        options={[
                                            {
                                                label: "Crea e configura",
                                                onClick: () => {
                                                    setCreateIntent("configure");
                                                    const form = document.getElementById(
                                                        "product-form-unified"
                                                    ) as HTMLFormElement | null;
                                                    form?.requestSubmit();
                                                }
                                            }
                                        ]}
                                    />
                                )}
                            </>
                        )
                    }
                >
                    {editingProduct ? (
                        <ProductForm
                            formId="product-form-edit-inline"
                            mode="edit"
                            productData={editingProduct}
                            parentProduct={null}
                            tenantId={currentTenantId ?? null}
                            onSuccess={handleInlineEditSuccess}
                            onSavingChange={setIsSavingEditProduct}
                        />
                    ) : addProductMode === "existing" ? (
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
                                    allowClear
                                />
                            </div>

                            <div className={styles.assignTableWrap}>
                                <DataTable<V2Product>
                                    data={assignableProducts}
                                    columns={assignColumns}
                                    emptyState={
                                        <Text variant="body-sm" colorVariant="muted">
                                            Nessun prodotto disponibile da associare.
                                        </Text>
                                    }
                                    rowsPerPage={8}
                                    rowClassName={row =>
                                        inheritedProductIds.has(row.id)
                                            ? styles.assignRowInherited
                                            : undefined
                                    }
                                    showSelectionBar={false}
                                />
                            </div>
                        </div>
                    ) : (
                        <ProductForm
                            formId="product-form-unified"
                            mode="create_base"
                            productData={null}
                            parentProduct={null}
                            tenantId={currentTenantId ?? null}
                            onSuccess={handleProductCreated}
                            onSavingChange={setIsSavingProduct}
                            skipAutoNavigate
                        />
                    )}
                </DrawerLayout>
            </SystemDrawer>

            {/* ── Modifica prodotto dalla tabella principale ─────────────── */}
            <SystemDrawer
                open={Boolean(mainEditProduct)}
                onClose={() => setMainEditProduct(null)}
                width={520}
            >
                <DrawerLayout
                    header={
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                            <div>
                                <Text variant="title-sm" weight={700}>
                                    Modifica prodotto
                                </Text>
                                <Text variant="caption" colorVariant="muted">
                                    {mainEditProduct?.name}
                                </Text>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                    window.open(
                                        `/business/${currentTenantId}/products/${mainEditProduct?.id}`,
                                        "_blank"
                                    )
                                }
                            >
                                Apri in Piatti →
                            </Button>
                        </div>
                    }
                    footer={
                        <>
                            <Button
                                variant="secondary"
                                onClick={() => setMainEditProduct(null)}
                                disabled={isSavingMainEdit}
                            >
                                Annulla
                            </Button>
                            <Button
                                variant="primary"
                                type="submit"
                                form="product-form-main-edit"
                                loading={isSavingMainEdit}
                                disabled={isSavingMainEdit}
                            >
                                Salva modifiche
                            </Button>
                        </>
                    }
                >
                    {mainEditProduct && (
                        <ProductForm
                            formId="product-form-main-edit"
                            mode="edit"
                            productData={mainEditProduct}
                            parentProduct={null}
                            tenantId={currentTenantId ?? null}
                            onSuccess={handleMainEditSuccess}
                            onSavingChange={setIsSavingMainEdit}
                        />
                    )}
                </DrawerLayout>
            </SystemDrawer>

            {/* ── Conferma rimozione prodotto dalla categoria ────────────── */}
            <SystemDrawer
                open={Boolean(productToRemoveFromCategory)}
                onClose={() => setProductToRemoveFromCategory(null)}
                width={420}
            >
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={700}>
                            Rimuovi dalla categoria
                        </Text>
                    }
                    footer={
                        <>
                            <Button
                                variant="secondary"
                                onClick={() => setProductToRemoveFromCategory(null)}
                            >
                                Annulla
                            </Button>
                            <Button variant="danger" onClick={handleRemoveFromCategory}>
                                Rimuovi
                            </Button>
                        </>
                    }
                >
                    <div className={styles.deleteWarning}>
                        <Text variant="body-sm">
                            Vuoi rimuovere "<strong>{productToRemoveFromCategory?.name}</strong>" dalla
                            categoria "<strong>{selectedCategory?.name}</strong>"?{" "}
                            Il prodotto non verrà eliminato dal sistema.
                        </Text>
                    </div>
                </DrawerLayout>
            </SystemDrawer>
        </section>
    );
}
