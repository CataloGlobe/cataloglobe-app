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
    DragEndEvent
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
                    return React.cloneElement(child as React.ReactElement<any>, {
                        dragHandleProps: listeners
                    });
                }
                return child;
            })}
        </div>
    );
};

function normalizeNote(note: string | null): string | null {
    if (note === "") return null;
    return note;
}

function cloneRows(rows: FeaturedContentProductRow[]): FeaturedContentProductRow[] {
    return rows.map(row => ({
        ...row,
        products: row.products ? { ...row.products } : null
    }));
}

function reindexRows(rows: FeaturedContentProductRow[]): FeaturedContentProductRow[] {
    return rows.map((row, index) => ({
        ...row,
        sort_order: index + 1
    }));
}

function areRowsEqual(a: FeaturedContentProductRow[], b: FeaturedContentProductRow[]): boolean {
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i += 1) {
        const left = a[i];
        const right = b[i];
        if (!left || !right) return false;
        if (left.product_id !== right.product_id) return false;
        if (left.sort_order !== right.sort_order) return false;
        if (normalizeNote(left.note) !== normalizeNote(right.note)) return false;
    }

    return true;
}

export default function ProductsManagerCard({
    featuredId,
    onOpenProductPicker
}: ProductsManagerCardProps) {
    const { showToast } = useToast();
    const tenantId = useTenantId();

    const [loading, setLoading] = useState(true);
    const [isSavingChanges, setIsSavingChanges] = useState(false);
    const [initialProducts, setInitialProducts] = useState<FeaturedContentProductRow[]>([]);
    const [draftProducts, setDraftProducts] = useState<FeaturedContentProductRow[]>([]);

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
                    products (id, name, base_price)
                `
                )
                .eq("featured_content_id", featuredId)
                .order("sort_order", { ascending: true });

            if (error) throw error;
            const loadedRows = reindexRows((data as any as FeaturedContentProductRow[]) ?? []);
            setInitialProducts(cloneRows(loadedRows));
            setDraftProducts(cloneRows(loadedRows));
        } catch (error) {
            console.error(error);
            showToast({ type: "error", message: "Errore nel caricamento dei prodotti associati." });
        } finally {
            setLoading(false);
        }
    }, [featuredId, showToast]);

    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    const hasUnsavedChanges = useMemo(
        () => !areRowsEqual(initialProducts, draftProducts),
        [initialProducts, draftProducts]
    );

    const handleCancelChanges = () => {
        setDraftProducts(cloneRows(initialProducts));
    };

    const handleNoteChange = (dbId: string, newNote: string) => {
        setDraftProducts(prev =>
            prev.map(row => (row.id === dbId ? { ...row, note: newNote } : row))
        );
    };

    const handleDelete = (dbId: string) => {
        setDraftProducts(prev => reindexRows(prev.filter(row => row.id !== dbId)));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = draftProducts.findIndex(row => row.id === active.id);
        const newIndex = draftProducts.findIndex(row => row.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;

        setDraftProducts(prev => reindexRows(arrayMove(prev, oldIndex, newIndex)));
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
            draftProducts.map(row => row.product_id),
            async (selectedProductIds: string[]) => {
                const dedupedSelection = Array.from(new Set(selectedProductIds));
                const existingByProductId = new Map(draftProducts.map(row => [row.product_id, row]));
                const missingProductIds = dedupedSelection.filter(
                    productId => !existingByProductId.has(productId)
                );

                let fetchedById = new Map<string, { id: string; name: string; base_price: number | null }>();

                if (missingProductIds.length > 0) {
                    const { data, error } = await supabase
                        .from("products")
                        .select("id, name, base_price")
                        .in("id", missingProductIds);

                    if (error) throw error;

                    fetchedById = new Map(
                        ((data ?? []) as { id: string; name: string; base_price: number | null }[]).map(
                            product => [product.id, product]
                        )
                    );
                }

                const nextRows: FeaturedContentProductRow[] = [];

                dedupedSelection.forEach(productId => {
                    const existing = existingByProductId.get(productId);
                    if (existing) {
                        nextRows.push({ ...existing, products: existing.products ? { ...existing.products } : null });
                        return;
                    }

                    const fetched = fetchedById.get(productId);
                    nextRows.push({
                        id: `tmp-${productId}`,
                        featured_content_id: featuredId,
                        product_id: productId,
                        sort_order: 0,
                        note: null,
                        products: fetched
                            ? {
                                  id: fetched.id,
                                  name: fetched.name,
                                  base_price: fetched.base_price
                              }
                            : null
                    });
                });

                setDraftProducts(reindexRows(nextRows));
            }
        );
    };

    const handleSaveChanges = async () => {
        if (!tenantId) {
            showToast({ type: "error", message: "Tenant non selezionato. Riprova." });
            return;
        }

        try {
            setIsSavingChanges(true);

            const initialByProductId = new Map(initialProducts.map(row => [row.product_id, row]));
            const draftByProductId = new Map(draftProducts.map(row => [row.product_id, row]));

            const toRemoveLinkIds = initialProducts
                .filter(row => !draftByProductId.has(row.product_id))
                .map(row => row.id);

            if (toRemoveLinkIds.length > 0) {
                const { error } = await supabase
                    .from("featured_content_products")
                    .delete()
                    .in("id", toRemoveLinkIds);
                if (error) throw error;
            }

            const toAddRows = draftProducts.filter(row => !initialByProductId.has(row.product_id));
            if (toAddRows.length > 0) {
                const payload = toAddRows.map(row => ({
                    tenant_id: tenantId,
                    featured_content_id: featuredId,
                    product_id: row.product_id,
                    sort_order: row.sort_order,
                    note: normalizeNote(row.note)
                }));

                const { error } = await supabase.from("featured_content_products").insert(payload);
                if (error) throw error;
            }

            const updatePromises = draftProducts
                .filter(row => initialByProductId.has(row.product_id))
                .filter(row => {
                    const original = initialByProductId.get(row.product_id);
                    if (!original) return false;
                    return (
                        original.sort_order !== row.sort_order ||
                        normalizeNote(original.note) !== normalizeNote(row.note)
                    );
                })
                .map(row => {
                    const original = initialByProductId.get(row.product_id);
                    return supabase
                        .from("featured_content_products")
                        .update({
                            sort_order: row.sort_order,
                            note: normalizeNote(row.note)
                        })
                        .eq("id", original!.id);
                });

            if (updatePromises.length > 0) {
                const updateResults = await Promise.all(updatePromises);
                const failed = updateResults.find(result => result.error);
                if (failed?.error) throw failed.error;
            }

            showToast({ type: "success", message: "Prodotti inclusi aggiornati." });
            await loadProducts();
        } catch (error) {
            console.error(error);
            showToast({ type: "error", message: "Errore durante il salvataggio dei prodotti." });
        } finally {
            setIsSavingChanges(false);
        }
    };

    const columns = useMemo<ColumnDefinition<FeaturedContentProductRow>[]>(
        () => [
            {
                id: "drag",
                header: "",
                width: "52px",
                align: "center",
                cell: (_value, _row, _rowIndex, dragHandleProps?: any) => (
                    <button
                        type="button"
                        aria-label="Trascina per riordinare"
                        {...dragHandleProps}
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
                    />
                )
            },
            {
                id: "price",
                header: "Prezzo base",
                accessor: row => row.products?.base_price,
                width: "140px",
                cell: value => (
                    <Text variant="body-sm" colorVariant="muted">
                        {typeof value === "number" ? `€${value.toFixed(2)}` : "-"}
                    </Text>
                )
            },
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
        []
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
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <Text variant="title-sm" weight={600}>
                            Prodotti inclusi
                        </Text>
                        {hasUnsavedChanges && (
                            <Text variant="caption" colorVariant="muted">
                                Hai modifiche non salvate
                            </Text>
                        )}
                    </div>

                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <Button variant="primary" onClick={handleOpenAddModal}>
                            + Aggiungi prodotto
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={handleCancelChanges}
                            disabled={!hasUnsavedChanges || isSavingChanges}
                        >
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSaveChanges}
                            disabled={!hasUnsavedChanges}
                            loading={isSavingChanges}
                        >
                            Salva
                        </Button>
                    </div>
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
                                items={draftProducts.map(product => product.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <DataTable<FeaturedContentProductRow>
                                    data={draftProducts}
                                    columns={columns}
                                    emptyState={
                                        <div style={{ padding: "24px", textAlign: "center" }}>
                                            <Text colorVariant="muted" style={{ marginBottom: "12px" }}>
                                                Nessun prodotto associato a questo contenuto.
                                            </Text>
                                            <Button variant="primary" onClick={handleOpenAddModal}>
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
