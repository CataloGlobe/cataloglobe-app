import { useState } from "react";
import { CollectionItemWithItem } from "@/types/database";
import Text from "@/components/ui/Text/Text";
import ConfirmModal from "@/components/ui/ConfirmModal/ConfirmModal";
import { Eye, EyeOff, GripVertical, Pencil, Plus, X } from "lucide-react";
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
import { IconButton } from "@/components/ui/Button/IconButton";

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

                <IconButton
                    variant="primary"
                    icon={<Plus size="18" />}
                    aria-label="Chiudi"
                    onClick={onAddItem}
                />
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
                                <SortableRow key={row.id} id={row.id}>
                                    {({ listeners }) => (
                                        <li role="listitem" className={styles.itemRow}>
                                            <IconButton
                                                className={styles.dragHandle}
                                                icon={<GripVertical size={16} />}
                                                {...listeners}
                                                aria-label="Riordina elemento"
                                            />

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
                                                <IconButton
                                                    variant="secondary"
                                                    icon={
                                                        row.visible ? (
                                                            <Eye size={16} color="#6366f1" />
                                                        ) : (
                                                            <EyeOff size={16} />
                                                        )
                                                    }
                                                    aria-label={
                                                        row.visible
                                                            ? "Nascondi elemento"
                                                            : "Mostra elemento"
                                                    }
                                                    onClick={() =>
                                                        onToggleVisibility(row.id, !row.visible)
                                                    }
                                                />

                                                <IconButton
                                                    variant="secondary"
                                                    icon={<Pencil size={16} />}
                                                    aria-label="Modifica elemento"
                                                    onClick={() => onEditItem(row)}
                                                />

                                                <IconButton
                                                    variant="secondary"
                                                    icon={<X size={16} />}
                                                    aria-label="Rimuovi elemento dalla collezione"
                                                    onClick={() => setItemToRemove(row)}
                                                />
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
