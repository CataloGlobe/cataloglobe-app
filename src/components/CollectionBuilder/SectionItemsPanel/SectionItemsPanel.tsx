import { useState } from "react";
import { CollectionItemWithItem } from "@/types/database";
import Text from "@/components/ui/Text/Text";
import { Eye, EyeOff, Pencil, Plus, X } from "lucide-react";
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
import { ItemRow } from "../ItemRow/ItemRow";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { Button } from "@/components/ui";

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
                    icon={<Plus size="15" />}
                    aria-label="Aggiungi"
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
                                        <ItemRow
                                            name={row.item.name}
                                            price={row.item.base_price}
                                            dragHandleProps={{ listeners }}
                                            actions={[
                                                {
                                                    icon: row.visible ? (
                                                        <Eye size={16} color="#6366f1" />
                                                    ) : (
                                                        <EyeOff size={16} />
                                                    ),
                                                    ariaLabel: row.visible
                                                        ? "Nascondi elemento"
                                                        : "Mostra elemento",
                                                    onClick: () =>
                                                        onToggleVisibility(row.id, !row.visible)
                                                },
                                                {
                                                    icon: <Pencil size={16} />,
                                                    ariaLabel: "Modifica elemento",
                                                    onClick: () => onEditItem(row)
                                                },
                                                {
                                                    icon: <X size={16} />,
                                                    ariaLabel: "Rimuovi elemento dalla collezione",
                                                    onClick: () => setItemToRemove(row)
                                                }
                                            ]}
                                        />
                                    )}
                                </SortableRow>
                            ))}
                        </ul>
                    </SortableContext>
                </DndContext>
            )}

            <ModalLayout
                isOpen={!!itemToRemove}
                onClose={() => setItemToRemove(null)}
                width="xs"
                height="fit"
            >
                <ModalLayoutHeader>
                    <div className={styles.headerLeft}>
                        <Text as="h2" variant="title-sm" weight={700}>
                            Rimuovi elemento
                        </Text>
                    </div>
                </ModalLayoutHeader>

                <ModalLayoutContent>
                    <Text variant="body">
                        {itemToRemove
                            ? `Vuoi rimuovere "${itemToRemove.item.name}" da questa categoria?`
                            : ""}
                    </Text>
                </ModalLayoutContent>

                <ModalLayoutFooter>
                    <Button variant="secondary" onClick={() => setItemToRemove(null)}>
                        Annulla
                    </Button>

                    <Button
                        variant="primary"
                        onClick={() => {
                            if (!itemToRemove) return;

                            onRemoveItem(itemToRemove.id);
                            setItemToRemove(null);
                        }}
                    >
                        Rimuovi
                    </Button>
                </ModalLayoutFooter>
            </ModalLayout>
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
