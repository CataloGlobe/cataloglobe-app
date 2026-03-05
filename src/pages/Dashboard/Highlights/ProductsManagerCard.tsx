import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { TextInput } from "@/components/ui/Input/TextInput";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { useToast } from "@/context/Toast/ToastContext";
import { supabase } from "@/services/supabase/client";
import { Trash2, GripVertical } from "lucide-react";
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
    onOpenProductPicker?: (linkedIds: string[], onAdd: (productId: string) => void) => void;
}

interface FeaturedContentProductRow {
    id: string; // The relationship ID
    featured_content_id: string;
    product_id: string;
    sort_order: number;
    note: string | null;
    v2_products: {
        id: string;
        name: string;
        base_price: number | null;
    } | null;
}

// ----------------------------------------------------
// Sortable Product Row
// ----------------------------------------------------
interface SortableProductRowProps {
    product: FeaturedContentProductRow;
    onNoteChange: (id: string, newNote: string) => void;
    onDelete: (id: string) => void;
}

function SortableProductRow({ product, onNoteChange, onDelete }: SortableProductRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: product.id
    });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        display: "grid",
        gridTemplateColumns: "32px 5fr 5fr 3fr 40px",
        gap: "16px",
        alignItems: "center",
        padding: "10px 16px",
        borderBottom: "1px solid var(--border-subtle, #e5e7eb)",
        background: isDragging ? "var(--surface-secondary)" : "var(--surface-primary)",
        boxShadow: isDragging ? "0 4px 16px rgba(0,0,0,0.12)" : "none",
        borderRadius: isDragging ? "8px" : "0",
        zIndex: isDragging ? 1 : "auto"
    };

    return (
        <div ref={setNodeRef} style={style}>
            {/* Drag Handle — ONLY this triggers drag */}
            <button
                {...attributes}
                {...listeners}
                type="button"
                aria-label="Trascina per riordinare"
                style={{
                    cursor: isDragging ? "grabbing" : "grab",
                    background: "none",
                    border: "none",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-muted)",
                    borderRadius: "4px"
                }}
            >
                <GripVertical size={16} />
            </button>

            {/* Nome Prodotto */}
            <div>
                <Text variant="body-sm" weight={600}>
                    {product.v2_products?.name || "Sconosciuto"}
                </Text>
            </div>

            {/* Nota */}
            <div>
                <TextInput
                    defaultValue={product.note || ""}
                    placeholder="Aggiungi una nota..."
                    onBlur={e => {
                        const newVal = e.target.value;
                        if (newVal !== product.note && !(newVal === "" && product.note === null)) {
                            onNoteChange(product.id, newVal);
                        }
                    }}
                    style={{ minWidth: "150px" }}
                />
            </div>

            {/* Prezzo */}
            <div>
                <Text variant="body-sm" colorVariant="muted">
                    {product.v2_products?.base_price !== null &&
                    product.v2_products?.base_price !== undefined
                        ? `€${product.v2_products.base_price.toFixed(2)}`
                        : "—"}
                </Text>
            </div>

            {/* Azioni */}
            <div style={{ justifySelf: "end" }}>
                <IconButton
                    variant="ghost"
                    icon={<Trash2 size={16} />}
                    onClick={() => onDelete(product.id)}
                    aria-label="Rimuovi prodotto"
                />
            </div>
        </div>
    );
}

// ----------------------------------------------------
// Main Card Component
// ----------------------------------------------------
export default function ProductsManagerCard({
    featuredId,
    onOpenProductPicker
}: ProductsManagerCardProps) {
    const { showToast } = useToast();

    // State for existing items
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<FeaturedContentProductRow[]>([]);

    // Fetch existing associated products
    const loadProducts = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from("v2_featured_content_products")
                .select(
                    `
                    id, 
                    featured_content_id, 
                    product_id, 
                    sort_order, 
                    note,
                    v2_products (id, name, base_price)
                `
                )
                .eq("featured_content_id", featuredId)
                .order("sort_order", { ascending: true });

            if (error) throw error;
            setProducts(data as any as FeaturedContentProductRow[]);
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

    // Handle Note change inline
    const handleNoteChange = async (dbId: string, newNote: string) => {
        try {
            const { error } = await supabase
                .from("v2_featured_content_products")
                .update({ note: newNote })
                .eq("id", dbId);

            if (error) throw error;
            showToast({ type: "success", message: "Nota aggiornata.", duration: 2000 });

            // Optimistic update
            setProducts(prev => prev.map(p => (p.id === dbId ? { ...p, note: newNote } : p)));
        } catch (error) {
            console.error(error);
            showToast({ type: "error", message: "Errore durante l'aggiornamento della nota." });
        }
    };

    // Handle Drag End
    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (!over || active.id === over.id) return;

        const oldIndex = products.findIndex(p => p.id === active.id);
        const newIndex = products.findIndex(p => p.id === over.id);

        const newOrder = arrayMove(products, oldIndex, newIndex);

        // Update local sort_order values sequentially based on the new array order
        const updatedProducts = newOrder.map((prod, index) => ({
            ...prod,
            sort_order: index + 1 // assuming 1-based order for display, adjust if necessary
        }));

        setProducts(updatedProducts);

        try {
            // Persist order in backend. Update ALL changed rows to avoid conflicts.
            // A more robust app might make an RPC call, this does a multi-update sequentially or bulk.
            // Using sequential updates for simplicity with current supabase client:
            const updates = updatedProducts.map(p =>
                supabase
                    .from("v2_featured_content_products")
                    .update({ sort_order: p.sort_order })
                    .eq("id", p.id)
            );

            await Promise.all(updates);
        } catch (error) {
            console.error("Order update failed", error);
            showToast({ type: "error", message: "Errore durante l'aggiornamento dell'ordine." });
            loadProducts(); // rollback on error
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    );

    // Handle Delete
    const handleDelete = async (dbId: string) => {
        try {
            const { error } = await supabase
                .from("v2_featured_content_products")
                .delete()
                .eq("id", dbId);

            if (error) throw error;
            showToast({ type: "success", message: "Prodotto rimosso con successo." });
            setProducts(prev => prev.filter(p => p.id !== dbId));
        } catch (error) {
            console.error(error);
            showToast({ type: "error", message: "Errore durante la rimozione del prodotto." });
        }
    };

    // Prepare to Add Product
    const handleOpenAddModal = () => {
        if (!onOpenProductPicker) return;

        onOpenProductPicker(
            products.map(p => p.product_id),
            async (selectedProductId: string) => {
                try {
                    const maxSortOrder =
                        products.length > 0 ? Math.max(...products.map(p => p.sort_order)) : 0;
                    const newSortOrder = maxSortOrder + 1;

                    const { error } = await supabase.from("v2_featured_content_products").insert({
                        featured_content_id: featuredId,
                        product_id: selectedProductId,
                        sort_order: newSortOrder,
                        note: null
                    });

                    if (error) throw error;

                    showToast({ type: "success", message: "Prodotto aggiunto con successo." });
                    loadProducts(); // fully refetch to get the joined data properly
                } catch (error) {
                    console.error(error);
                    showToast({ type: "error", message: "Errore nell'aggiunta del prodotto." });
                }
            }
        );
    };

    return (
        <Card>
            <div style={{ display: "flex", flexDirection: "column" }}>
                <div
                    style={{
                        padding: "24px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                    }}
                >
                    <Text variant="title-sm" weight={600}>
                        Prodotti inclusi
                    </Text>
                    <Button variant="primary" onClick={handleOpenAddModal}>
                        + Aggiungi prodotto
                    </Button>
                </div>

                {loading ? (
                    <div style={{ padding: "24px", textAlign: "center" }}>
                        <Text colorVariant="muted">Caricamento prodotti inclusi...</Text>
                    </div>
                ) : products.length === 0 ? (
                    <div
                        style={{
                            padding: "48px 24px",
                            textAlign: "center",
                            background: "var(--surface-secondary)"
                        }}
                    >
                        <Text colorVariant="muted" style={{ marginBottom: "16px" }}>
                            Nessun prodotto associato a questo contenuto.
                        </Text>
                        <Button variant="primary" onClick={handleOpenAddModal}>
                            Aggiungi il primo prodotto
                        </Button>
                    </div>
                ) : (
                    <div>
                        {/* Fake Table Header */}
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "32px 5fr 5fr 3fr 40px",
                                gap: "16px",
                                padding: "10px 16px",
                                borderBottom: "1px solid var(--border-subtle, #e5e7eb)",
                                background: "var(--surface-secondary)",
                                borderTopLeftRadius: "var(--radius-lg)",
                                borderTopRightRadius: "var(--radius-lg)"
                            }}
                        >
                            {/* empty for grip */}
                            <div />
                            <Text variant="caption" weight={600} colorVariant="muted">
                                Nome prodotto
                            </Text>
                            <Text variant="caption" weight={600} colorVariant="muted">
                                Nota
                            </Text>
                            <Text variant="caption" weight={600} colorVariant="muted">
                                Prezzo base
                            </Text>
                            <div />
                        </div>

                        {/* Draggable List */}
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={products.map(p => p.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {products.map(product => (
                                    <SortableProductRow
                                        key={product.id}
                                        product={product}
                                        onNoteChange={handleNoteChange}
                                        onDelete={handleDelete}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    </div>
                )}
            </div>
        </Card>
    );
}
