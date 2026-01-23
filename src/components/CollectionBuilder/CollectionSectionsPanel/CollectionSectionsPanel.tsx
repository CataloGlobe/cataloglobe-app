import { useState } from "react";
import { CollectionSection } from "@/types/database";
import Text from "@/components/ui/Text/Text";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    DraggableSyntheticListeners
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ConfirmModal from "@/components/ui/ConfirmModal/ConfirmModal";
import styles from "./CollectionSectionsPanel.module.scss";
import { CollectionSectionItem } from "./CollectionSectionItem/CollectionSectionItem";

interface CollectionSectionsPanelProps {
    sections: CollectionSection[];
    activeSectionId: string | null;
    onSelectSection: (id: string) => void;
    onReorderSections: (activeId: string, overId: string) => void;
    onRenameSection: (sectionId: string, label: string) => Promise<void> | void;
    onDeleteSection: (sectionId: string) => Promise<void> | void;
}

export function CollectionSectionsPanel({
    sections,
    activeSectionId,
    onSelectSection,
    onReorderSections,
    onRenameSection,
    onDeleteSection
}: CollectionSectionsPanelProps) {
    /* ----------------------------
     * DELETE
     * -------------------------- */
    const [sectionToDelete, setSectionToDelete] = useState<CollectionSection | null>(null);

    /* ----------------------------
     * DND
     * -------------------------- */
    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

    return (
        <aside className={styles.sections} aria-label="Categorie">
            {/* HEADER */}
            <div className={styles.header}>
                <Text variant="body" weight={600}>
                    Categorie
                </Text>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={({ active, over }) => {
                    if (!over || active.id === over.id) return;
                    onReorderSections(active.id as string, over.id as string);
                }}
            >
                <SortableContext
                    items={sections.map(s => s.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <ul role="list" className={styles.sectionList}>
                        {sections.map(section => (
                            <SortableSection key={section.id} id={section.id}>
                                {({ listeners }) => (
                                    <CollectionSectionItem
                                        section={section}
                                        isActive={section.id === activeSectionId}
                                        listeners={listeners}
                                        onSelect={onSelectSection}
                                        onRename={onRenameSection}
                                        onDelete={setSectionToDelete}
                                    />
                                )}
                            </SortableSection>
                        ))}
                    </ul>
                </SortableContext>
            </DndContext>

            {/* LIST */}

            {/* CONFIRM DELETE */}
            <ConfirmModal
                isOpen={!!sectionToDelete}
                title="Eliminare categoria"
                description={
                    sectionToDelete
                        ? `Vuoi eliminare la categoria "${sectionToDelete.label}"? Gli elementi non verranno eliminati.`
                        : ""
                }
                confirmLabel="Elimina"
                cancelLabel="Annulla"
                onCancel={() => setSectionToDelete(null)}
                onConfirm={async () => {
                    if (!sectionToDelete) return;
                    await onDeleteSection(sectionToDelete.id);
                    setSectionToDelete(null);
                }}
            />
        </aside>
    );
}

/* ----------------------------
 * SORTABLE ITEM
 * -------------------------- */
function SortableSection({
    id,
    children
}: {
    id: string;
    children: (args: { listeners: DraggableSyntheticListeners }) => React.ReactNode;
}) {
    const { setNodeRef, transform, transition, listeners, attributes } = useSortable({ id });

    return (
        <li
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition
            }}
            {...attributes}
        >
            {children({ listeners })}
        </li>
    );
}
