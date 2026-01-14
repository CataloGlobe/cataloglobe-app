import { useRef, useState } from "react";
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
import { Pencil, Save, Trash2 } from "lucide-react";
import ConfirmModal from "@/components/ui/ConfirmModal/ConfirmModal";
import styles from "./CollectionSectionsPanel.module.scss";
import { TextInput } from "@/components/ui/Input/TextInput";

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
     * RENAME
     * -------------------------- */
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftName, setDraftName] = useState("");
    const renameInputRef = useRef<HTMLInputElement | null>(null);

    const startRename = (id: string, label: string) => {
        setEditingId(id);
        setDraftName(label);
        setTimeout(() => {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
        }, 0);
    };

    const cancelRename = () => {
        setEditingId(null);
        setDraftName("");
    };

    const commitRename = async (id: string, originalName: string) => {
        const next = draftName.trim();
        if (!next || next === originalName.trim()) {
            cancelRename();
            return;
        }
        await onRenameSection(id, next);
        cancelRename();
    };

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
                <Text variant="caption" weight={600}>
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
                                    <button
                                        type="button"
                                        className={
                                            section.id === activeSectionId
                                                ? styles.sectionActive
                                                : styles.section
                                        }
                                        onClick={() => onSelectSection(section.id)}
                                    >
                                        <span {...listeners} className={styles.dragHandle}>
                                            ☰
                                        </span>

                                        {editingId === section.id ? (
                                            <TextInput
                                                ref={renameInputRef}
                                                value={draftName}
                                                onChange={e => setDraftName(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        void commitRename(
                                                            section.id,
                                                            section.label
                                                        );
                                                    }
                                                    if (e.key === "Escape") {
                                                        e.preventDefault();
                                                        cancelRename();
                                                    }
                                                }}
                                                onBlur={() =>
                                                    void commitRename(section.id, section.label)
                                                }
                                                endAdornment={<Save size={16} />}
                                                onEndAdornmentClick={() => {
                                                    void commitRename(section.id, section.label);
                                                }}
                                            />
                                        ) : (
                                            <div className={styles.sectionLabel}>
                                                <Text>{section.label}</Text>

                                                <div className={styles.actions}>
                                                    <button
                                                        type="button"
                                                        className={styles.iconBtn}
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            startRename(section.id, section.label);
                                                        }}
                                                    >
                                                        <Pencil size={14} />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className={`${styles.iconBtn} ${styles.danger}`}
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            setSectionToDelete(section);
                                                        }}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </button>
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
