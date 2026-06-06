import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { SortableDataTableRow } from "@/components/ui/DataTable/SortableDataTableRow";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import {
    type FeaturedContentProductRow,
    listFeaturedContentProducts,
    deleteFeaturedContentProduct,
    updateFeaturedContentProductNote,
    updateFeaturedContentProductsSortOrder,
    syncFeaturedContentProducts
} from "@services/supabase/featuredContents";
import { GripVertical, Trash2, Pencil } from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { ProductForm } from "@/pages/Dashboard/Products/components/ProductForm";
import { getProduct, type V2Product } from "@services/supabase/products";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy
} from "@dnd-kit/sortable";

interface ProductsManagerCardProps {
    featuredId: string;
    pricingMode: "none" | "per_item" | "bundle";
    showOriginalTotal: boolean;
    onOpenProductPicker?: (
        linkedIds: string[],
        onApply: (productIds: string[]) => Promise<void>
    ) => void;
    // Pubblica un trigger "apri picker prodotti" verso il parent (CTA in banda).
    onRegisterAddTrigger?: (trigger: () => void) => void;
}

function formatPrice(price: number): string {
    return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2
    }).format(price);
}

function computeFromPrice(
    optionGroups: Array<{ group_kind: string; values: Array<{ absolute_price: number | null }> }> | null
): number | null {
    const primaryGroup = (optionGroups ?? []).find(g => g.group_kind === "PRIMARY_PRICE");
    if (!primaryGroup || primaryGroup.values.length === 0) return null;
    const prices = primaryGroup.values
        .map(v => v.absolute_price)
        .filter((p): p is number => p != null);
    return prices.length > 0 ? Math.min(...prices) : null;
}

function normalizeNote(note: string | null): string | null {
    if (note === "") return null;
    return note;
}

function reindexRows(rows: FeaturedContentProductRow[]): FeaturedContentProductRow[] {
    return rows.map((row, index) => ({ ...row, sort_order: index + 1 }));
}

export default function ProductsManagerCard({
    featuredId,
    pricingMode,
    showOriginalTotal,
    onOpenProductPicker,
    onRegisterAddTrigger
}: ProductsManagerCardProps) {
    const { showToast } = useToast();
    const tenantId = useTenantId();

    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<FeaturedContentProductRow[]>([]);
    const [editingProduct, setEditingProduct] = useState<V2Product | null>(null);
    const [isSavingEditProduct, setIsSavingEditProduct] = useState(false);

    const loadProducts = useCallback(async () => {
        if (!tenantId) return;
        try {
            setLoading(true);
            const data = await listFeaturedContentProducts(featuredId, tenantId);
            setProducts(reindexRows(data));
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nel caricamento dei prodotti associati." });
        } finally {
            setLoading(false);
        }
    }, [featuredId, tenantId, showToast]);

    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    const handleDelete = async (dbId: string) => {
        if (!tenantId) return;
        try {
            await deleteFeaturedContentProduct(dbId, tenantId);
            showToast({ type: "success", message: "Prodotto rimosso." });
            await loadProducts();
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nella rimozione del prodotto." });
        }
    };

    const handleEditProduct = async (productId: string) => {
        if (!tenantId) return;
        try {
            const product = await getProduct(productId, tenantId);
            setEditingProduct(product);
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Impossibile caricare il prodotto." });
        }
    };

    const handleNoteChange = (dbId: string, newNote: string) => {
        setProducts(prev =>
            prev.map(row => (row.id === dbId ? { ...row, note: newNote } : row))
        );
    };

    const handleNoteBlur = async (dbId: string, note: string) => {
        if (!tenantId) return;
        try {
            await updateFeaturedContentProductNote(dbId, tenantId, normalizeNote(note));
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nel salvataggio della nota." });
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = products.findIndex(row => row.id === active.id);
        const newIndex = products.findIndex(row => row.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;

        const reindexed = reindexRows(arrayMove(products, oldIndex, newIndex));
        setProducts(reindexed); // ottimistico

        if (!tenantId) return;
        try {
            await updateFeaturedContentProductsSortOrder(
                reindexed.map(row => ({ id: row.id, sort_order: row.sort_order })),
                tenantId
            );
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nel salvataggio dell'ordine." });
            await loadProducts(); // rollback
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    );

    const handleOpenAddModalRef = useRef<() => void>(() => {});
    const handleOpenAddModal = () => {
        if (!onOpenProductPicker) return;

        onOpenProductPicker(
            products.map(row => row.product_id),
            async (selectedProductIds: string[]) => {
                if (!tenantId) {
                    showToast({ type: "error", message: "Tenant non selezionato. Riprova." });
                    return;
                }

                const dedupedSelection = Array.from(new Set(selectedProductIds));
                const existingByProductId = new Map(products.map(row => [row.product_id, row]));

                const toRemoveIds = products
                    .filter(row => !dedupedSelection.includes(row.product_id))
                    .map(row => row.id);

                const toAddProductIds = dedupedSelection.filter(
                    id => !existingByProductId.has(id)
                );

                try {
                    await syncFeaturedContentProducts(
                        featuredId,
                        tenantId,
                        toRemoveIds,
                        toAddProductIds.map((productId, idx) => ({
                            productId,
                            sortOrder: products.length + idx + 1
                        }))
                    );
                    showToast({ type: "success", message: "Prodotti aggiornati." });
                    await loadProducts();
                } catch (err) {
                    console.error(err);
                    showToast({
                        type: "error",
                        message: "Errore durante il salvataggio dei prodotti."
                    });
                }
            }
        );
    };

    handleOpenAddModalRef.current = handleOpenAddModal;

    useEffect(() => {
        if (!onRegisterAddTrigger) return;
        onRegisterAddTrigger(() => handleOpenAddModalRef.current?.());
    }, [onRegisterAddTrigger]);

    const showPriceColumn =
        pricingMode === "per_item" || (pricingMode === "bundle" && showOriginalTotal);

    const columns = useMemo<ColumnDefinition<FeaturedContentProductRow>[]>(
        () => [
            {
                id: "drag",
                header: "",
                width: "52px",
                align: "center",
                cell: (_value, _row, _rowIndex, dragHandleProps?: unknown) => (
                    <button
                        type="button"
                        aria-label="Trascina per riordinare"
                        {...(dragHandleProps as React.HTMLAttributes<HTMLButtonElement>)}
                        style={{
                            cursor: "grab",
                            border: "none",
                            background: "transparent",
                            color: "var(--text-muted)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "4px",
                            borderRadius: "4px"
                        }}
                    >
                        <GripVertical size={16} />
                    </button>
                )
            },
            {
                id: "name",
                header: "Nome prodotto",
                accessor: row => row.products?.name ?? "Sconosciuto",
                width: "2fr",
                cell: value => (
                    <Text variant="body-sm" weight={600}>
                        {String(value)}
                    </Text>
                )
            },
            {
                id: "note",
                header: "Nota",
                width: "2fr",
                cell: (_value, row) => (
                    <TextInput
                        value={row.note ?? ""}
                        placeholder="Aggiungi una nota..."
                        onChange={event => handleNoteChange(row.id, event.target.value)}
                        onBlur={event => handleNoteBlur(row.id, event.target.value)}
                    />
                )
            },
            ...(showPriceColumn
                ? [
                      {
                          id: "price" as const,
                          header: "Prezzo",
                          width: "100px",
                          align: "right" as const,
                          cell: (_value: unknown, row: FeaturedContentProductRow) => {
                              const product = row.products;
                              if (!product) {
                                  return (
                                      <Text variant="body-sm" colorVariant="muted">
                                          —
                                      </Text>
                                  );
                              }
                              if (product.base_price != null) {
                                  return (
                                      <Text variant="body-sm" weight={500}>
                                          {formatPrice(product.base_price)}
                                      </Text>
                                  );
                              }
                              const fromPrice = computeFromPrice(product.option_groups ?? null);
                              if (fromPrice != null) {
                                  return (
                                      <Text variant="body-sm" weight={500}>
                                          {"da " + formatPrice(fromPrice)}
                                      </Text>
                                  );
                              }
                              return (
                                  <Text variant="body-sm" colorVariant="muted">
                                      —
                                  </Text>
                              );
                          }
                      }
                  ]
                : []),
            {
                id: "actions",
                header: "",
                align: "right",
                width: "56px",
                cell: (_value, row) => (
                    <TableRowActions
                        actions={[
                            {
                                label: "Modifica",
                                icon: Pencil,
                                onClick: () => void handleEditProduct(row.product_id)
                            },
                            {
                                label: "Rimuovi prodotto",
                                icon: Trash2,
                                variant: "destructive",
                                separator: true,
                                onClick: () => handleDelete(row.id)
                            }
                        ]}
                    />
                )
            }
        ],
        [showPriceColumn]
    );

    return (
        <>
            {loading ? (
                <div style={{ padding: "24px", textAlign: "center" }}>
                    <Text colorVariant="muted">Caricamento prodotti inclusi...</Text>
                </div>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={products.map(product => product.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <DataTable<FeaturedContentProductRow>
                            data={products}
                            columns={columns}
                            emptyState={{
                                title: "Nessun prodotto associato a questo contenuto.",
                                action: (
                                    <Button
                                        variant="primary"
                                        onClick={handleOpenAddModal}
                                    >
                                        Aggiungi il primo prodotto
                                    </Button>
                                )
                            }}
                            rowWrapper={(row, rowData) => (
                                <SortableDataTableRow
                                    key={rowData.id}
                                    id={rowData.id}
                                    draggingOpacity={0.55}
                                >
                                    {row}
                                </SortableDataTableRow>
                            )}
                        />
                    </SortableContext>
                </DndContext>
            )}

        <SystemDrawer open={Boolean(editingProduct)} onClose={() => setEditingProduct(null)} width={520}>
            <DrawerLayout
                header={
                    <div>
                        <Text variant="title-sm" weight={700}>Modifica prodotto</Text>
                        {editingProduct?.name && (
                            <Text variant="caption" colorVariant="muted">{editingProduct.name}</Text>
                        )}
                    </div>
                }
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => setEditingProduct(null)}
                            disabled={isSavingEditProduct}
                        >
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form="product-form-featured-edit"
                            loading={isSavingEditProduct}
                            disabled={isSavingEditProduct}
                        >
                            Salva modifiche
                        </Button>
                    </>
                }
            >
                {editingProduct && (
                    <ProductForm
                        formId="product-form-featured-edit"
                        mode="edit"
                        productData={editingProduct}
                        parentProduct={null}
                        tenantId={tenantId ?? null}
                        onSuccess={async () => {
                            setEditingProduct(null);
                            await loadProducts();
                        }}
                        onSavingChange={setIsSavingEditProduct}
                    />
                )}
            </DrawerLayout>
        </SystemDrawer>
        </>
    );
}
