import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { supabase } from "@/services/supabase/client";
import { GripVertical, Trash2 } from "lucide-react";
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
    verticalListSortingStrategy,
    useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ProductsManagerCardProps {
    featuredId: string;
    pricingMode: "none" | "per_item" | "bundle";
    showOriginalTotal: boolean;
    onOpenProductPicker?: (
        linkedIds: string[],
        onApply: (productIds: string[]) => Promise<void>
    ) => void;
}

interface FeaturedContentProductRow {
    id: string;
    featured_content_id: string;
    product_id: string;
    sort_order: number;
    note: string | null;
    products: {
        id: string;
        name: string;
        base_price: number | null;
        option_groups: Array<{
            group_kind: string;
            values: Array<{ absolute_price: number | null }>;
        }> | null;
    } | null;
}

type SortableDataTableRowProps = {
    children: React.ReactNode;
    id: string;
};

const SortableDataTableRow = ({ children, id }: SortableDataTableRowProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id
    });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : 0,
        position: "relative",
        opacity: isDragging ? 0.55 : 1
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes}>
            {React.Children.map(children, child => {
                if (React.isValidElement(child)) {
                    return React.cloneElement(
                        child as React.ReactElement<{ dragHandleProps?: unknown }>,
                        { dragHandleProps: listeners }
                    );
                }
                return child;
            })}
        </div>
    );
};

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
    onOpenProductPicker
}: ProductsManagerCardProps) {
    const { showToast } = useToast();
    const tenantId = useTenantId();

    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [products, setProducts] = useState<FeaturedContentProductRow[]>([]);

    const loadProducts = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from("featured_content_products")
                .select(
                    `
                    id,
                    featured_content_id,
                    product_id,
                    sort_order,
                    note,
                    products (id, name, base_price, option_groups:product_option_groups(group_kind, values:product_option_values(absolute_price)))
                `
                )
                .eq("featured_content_id", featuredId)
                .order("sort_order", { ascending: true });

            if (error) throw error;
            setProducts(reindexRows((data as unknown as FeaturedContentProductRow[]) ?? []));
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nel caricamento dei prodotti associati." });
        } finally {
            setLoading(false);
        }
    }, [featuredId, showToast]);

    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    const handleDelete = async (dbId: string) => {
        try {
            setIsSaving(true);
            const { error } = await supabase
                .from("featured_content_products")
                .delete()
                .eq("id", dbId);
            if (error) throw error;
            showToast({ type: "success", message: "Prodotto rimosso." });
            await loadProducts();
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nella rimozione del prodotto." });
        } finally {
            setIsSaving(false);
        }
    };

    const handleNoteChange = (dbId: string, newNote: string) => {
        setProducts(prev =>
            prev.map(row => (row.id === dbId ? { ...row, note: newNote } : row))
        );
    };

    const handleNoteBlur = async (dbId: string, note: string) => {
        const { error } = await supabase
            .from("featured_content_products")
            .update({ note: normalizeNote(note) })
            .eq("id", dbId);
        if (error) {
            console.error(error);
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

        try {
            const results = await Promise.all(
                reindexed.map(row =>
                    supabase
                        .from("featured_content_products")
                        .update({ sort_order: row.sort_order })
                        .eq("id", row.id)
                )
            );
            const failed = results.find(r => r.error);
            if (failed?.error) throw failed.error;
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
                    setIsSaving(true);
                    const ops: PromiseLike<void>[] = [];

                    if (toRemoveIds.length > 0) {
                        ops.push(
                            supabase
                                .from("featured_content_products")
                                .delete()
                                .in("id", toRemoveIds)
                                .then(({ error }) => {
                                    if (error) throw error;
                                })
                        );
                    }

                    if (toAddProductIds.length > 0) {
                        const payload = toAddProductIds.map((productId, idx) => ({
                            tenant_id: tenantId,
                            featured_content_id: featuredId,
                            product_id: productId,
                            sort_order: products.length + idx + 1,
                            note: null
                        }));
                        ops.push(
                            supabase
                                .from("featured_content_products")
                                .insert(payload)
                                .then(({ error }) => {
                                    if (error) throw error;
                                })
                        );
                    }

                    await Promise.all(ops);
                    showToast({ type: "success", message: "Prodotti aggiornati." });
                    await loadProducts();
                } catch (err) {
                    console.error(err);
                    showToast({
                        type: "error",
                        message: "Errore durante il salvataggio dei prodotti."
                    });
                } finally {
                    setIsSaving(false);
                }
            }
        );
    };

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
                width: "72px",
                cell: (_value, row) => (
                    <TableRowActions
                        actions={[
                            {
                                label: "Rimuovi prodotto",
                                icon: Trash2,
                                variant: "destructive",
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
        <Card>
            <div style={{ display: "flex", flexDirection: "column" }}>
                <div
                    style={{
                        padding: "24px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px"
                    }}
                >
                    <Text variant="title-sm" weight={600}>
                        Prodotti inclusi
                    </Text>
                    <Button
                        variant="primary"
                        onClick={handleOpenAddModal}
                        disabled={isSaving}
                    >
                        + Aggiungi prodotto
                    </Button>
                </div>

                {loading ? (
                    <div style={{ padding: "24px", textAlign: "center" }}>
                        <Text colorVariant="muted">Caricamento prodotti inclusi...</Text>
                    </div>
                ) : (
                    <div style={{ padding: "0 24px 24px 24px" }}>
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
                                    emptyState={
                                        <div style={{ padding: "24px", textAlign: "center" }}>
                                            <Text
                                                colorVariant="muted"
                                                style={{ marginBottom: "12px" }}
                                            >
                                                Nessun prodotto associato a questo contenuto.
                                            </Text>
                                            <Button
                                                variant="primary"
                                                onClick={handleOpenAddModal}
                                            >
                                                Aggiungi il primo prodotto
                                            </Button>
                                        </div>
                                    }
                                    rowWrapper={(row, rowData) => (
                                        <SortableDataTableRow key={rowData.id} id={rowData.id}>
                                            {row}
                                        </SortableDataTableRow>
                                    )}
                                />
                            </SortableContext>
                        </DndContext>
                    </div>
                )}
            </div>
        </Card>
    );
}
