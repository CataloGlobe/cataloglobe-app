import { useState } from "react";
import { CollectionItemWithItem } from "@/types/database";
import Text from "@/components/ui/Text/Text";
import ConfirmModal from "@/components/ui/ConfirmModal/ConfirmModal";
import { Eye, EyeOff, Pencil, X } from "lucide-react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DraggableSyntheticListeners
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import styles from "./SectionItemsPanel.module.scss";

interface SectionItemsPanelProps {
    sectionLabel: string;
    items: CollectionItemWithItem[];

    onToggleVisibility: (collectionItemId: string, visible: boolean) => void;
    onAddItem: () => void;
    onEditItem: (item: CollectionItemWithItem) => void;
    onRemoveItem: (collectionItemId: string) => void;
    onReorder: (activeId: string, overId: string) => void;
}

export function SectionItemsPanel({
    sectionLabel,
    items,
    onToggleVisibility,
    onAddItem,
    onEditItem,
    onRemoveItem,
    onReorder
}: SectionItemsPanelProps) {
    const [itemToRemove, setItemToRemove] = useState<CollectionItemWithItem | null>(null);
    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

    return (
        <main className={styles.items} aria-label="Contenuti categoria">
            <header className={styles.itemsHeader}>
                <Text variant="title-sm" weight={600}>
                    {sectionLabel ?? "Seleziona una categoria"}
                </Text>

                <div className={styles.itemsActions}>
                    <button type="button" onClick={onAddItem} className={styles.primaryAction}>
                        <Text variant="caption" weight={600}>
                            + Aggiungi elemento
                        </Text>
                    </button>
                </div>
            </header>

            {items.length === 0 ? (
                <div className={styles.empty}>
                    <Text colorVariant="muted">Nessun elemento in questo catalogo</Text>
                </div>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={event => {
                        const { active, over } = event;
                        if (!over || active.id === over.id) return;
                        onReorder(active.id as string, over.id as string);
                    }}
                >
                    <SortableContext
                        items={items.map(it => it.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <ul className={styles.itemsList} role="list">
                            {items.map(row => (
                                <SortableRow id={row.id}>
                                    {({ listeners }) => (
                                        <li role="listitem" className={styles.itemRow}>
                                            <button
                                                type="button"
                                                className={styles.dragHandle}
                                                {...listeners}
                                                aria-label="Riordina elemento"
                                            >
                                                ☰
                                            </button>

                                            {/* MAIN */}
                                            <div className={styles.itemMain}>
                                                <Text weight={600}>{row.item.name}</Text>

                                                {row.item.base_price != null && (
                                                    <Text variant="caption" colorVariant="muted">
                                                        € {row.item.base_price}
                                                    </Text>
                                                )}
                                            </div>

                                            {/* ACTIONS */}
                                            <div className={styles.itemActions}>
                                                <button
                                                    type="button"
                                                    aria-label={
                                                        row.visible
                                                            ? "Nascondi elemento"
                                                            : "Mostra elemento"
                                                    }
                                                    onClick={() =>
                                                        onToggleVisibility(row.id, !row.visible)
                                                    }
                                                    className={styles.iconButton}
                                                >
                                                    {row.visible ? (
                                                        <Eye size={16} />
                                                    ) : (
                                                        <EyeOff size={16} />
                                                    )}
                                                </button>

                                                <button
                                                    type="button"
                                                    aria-label="Modifica elemento"
                                                    onClick={() => onEditItem(row)}
                                                    className={styles.iconButton}
                                                >
                                                    <Pencil size={16} />
                                                </button>

                                                <button
                                                    type="button"
                                                    aria-label="Rimuovi elemento dalla collezione"
                                                    onClick={() => setItemToRemove(row)}
                                                    className={`${styles.iconButton} ${styles.danger}`}
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        </li>
                                    )}
                                </SortableRow>
                            ))}
                        </ul>
                    </SortableContext>
                </DndContext>
            )}

            <ConfirmModal
                isOpen={!!itemToRemove}
                title="Rimuovere elemento"
                description={
                    itemToRemove
                        ? `Vuoi rimuovere "${itemToRemove.item.name}" da questa categoria?`
                        : ""
                }
                confirmLabel="Rimuovi"
                cancelLabel="Annulla"
                onCancel={() => setItemToRemove(null)}
                onConfirm={() => {
                    if (!itemToRemove) return;

                    onRemoveItem(itemToRemove.id);
                    setItemToRemove(null);
                }}
            />
        </main>
    );
}

function SortableRow({
    id,
    children
}: {
    id: string;
    children: (args: { listeners: DraggableSyntheticListeners }) => React.ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} role="listitem">
            {children({ listeners })}
        </div>
    );
}
