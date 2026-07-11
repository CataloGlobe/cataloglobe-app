import React from "react";
import { GripVertical, Trash2, Type, Image, Video } from "lucide-react";
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
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { SortableDataTableRow } from "@/components/ui/DataTable/SortableDataTableRow";
import { StoryBlock } from "@/services/supabase/stories";
import { TextBlock } from "./blocks/TextBlock";
import { ImageBlock } from "./blocks/ImageBlock";
import { VideoBlock } from "./blocks/VideoBlock";
import styles from "./StoryBlockEditor.module.scss";

interface StoryBlockEditorProps {
    value: StoryBlock[];
    onChange: (next: StoryBlock[]) => void;
    /** File pendenti per blocco immagine, keyed by block.id (posseduti dal parent). */
    pendingImages: Record<string, File>;
    onPendingImageChange: (blockId: string, file: File | null) => void;
    disabled?: boolean;
}

function makeBlockId() {
    return crypto.randomUUID();
}

interface BlockRowProps {
    block: StoryBlock;
    pendingImage: File | null;
    onPendingImageChange: (file: File | null) => void;
    disabled?: boolean;
    onUpdate: (next: StoryBlock) => void;
    onRemove: () => void;
    /** Injected by SortableDataTableRow.cloneElement on its direct child. */
    dragHandleProps?: unknown;
}

function BlockRow({
    block,
    pendingImage,
    onPendingImageChange,
    disabled,
    onUpdate,
    onRemove,
    dragHandleProps
}: BlockRowProps) {
    return (
        <div className={styles.block}>
            <button
                type="button"
                aria-label="Trascina per riordinare"
                className={styles.dragHandle}
                {...(dragHandleProps as React.HTMLAttributes<HTMLButtonElement>)}
            >
                <GripVertical size={16} />
            </button>

            <div className={styles.blockBody}>
                {block.type === "text" && <TextBlock block={block} onChange={onUpdate} disabled={disabled} />}
                {block.type === "image" && (
                    <ImageBlock
                        block={block}
                        pendingFile={pendingImage}
                        onPendingFileChange={onPendingImageChange}
                        onChange={onUpdate}
                        disabled={disabled}
                    />
                )}
                {block.type === "video" && <VideoBlock block={block} onChange={onUpdate} disabled={disabled} />}
            </div>

            {!disabled && (
                <button type="button" aria-label="Elimina blocco" className={styles.removeBtn} onClick={onRemove}>
                    <Trash2 size={16} />
                </button>
            )}
        </div>
    );
}

export function StoryBlockEditor({
    value,
    onChange,
    pendingImages,
    onPendingImageChange,
    disabled
}: StoryBlockEditorProps) {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = value.findIndex(b => b.id === active.id);
        const newIndex = value.findIndex(b => b.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        onChange(arrayMove(value, oldIndex, newIndex));
    };

    const updateBlock = (id: string, next: StoryBlock) => {
        onChange(value.map(b => (b.id === id ? next : b)));
    };

    const removeBlock = (block: StoryBlock) => {
        // Rimozione PENDENTE: nessuna delete storage qui. L'immagine del blocco
        // viene pulita al Salva (cleanup orfani in saveStory) — così "esci senza
        // salvare" non perde nulla.
        onChange(value.filter(b => b.id !== block.id));
        if (block.type === "image") onPendingImageChange(block.id, null);
    };

    const addTextBlock = () => {
        onChange([...value, { id: makeBlockId(), type: "text", content: "" }]);
    };

    const addImageBlock = () => {
        onChange([...value, { id: makeBlockId(), type: "image", url: "", caption: "" }]);
    };

    const addVideoBlock = () => {
        onChange([...value, { id: makeBlockId(), type: "video", provider: "youtube", ref: "" }]);
    };

    return (
        <div className={styles.root}>
            {value.length === 0 && (
                <Text variant="body-sm" colorVariant="muted">
                    Nessun blocco. Aggiungine uno per iniziare a scrivere.
                </Text>
            )}

            {value.length > 0 && (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={value.map(b => b.id)} strategy={verticalListSortingStrategy}>
                        <div className={styles.list}>
                            {value.map(block => (
                                <SortableDataTableRow key={block.id} id={block.id} draggingOpacity={0.55}>
                                    <BlockRow
                                        block={block}
                                        pendingImage={pendingImages[block.id] ?? null}
                                        onPendingImageChange={file => onPendingImageChange(block.id, file)}
                                        disabled={disabled}
                                        onUpdate={next => updateBlock(block.id, next)}
                                        onRemove={() => removeBlock(block)}
                                    />
                                </SortableDataTableRow>
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}

            {!disabled && (
                <div className={styles.addRow}>
                    <Button variant="secondary" size="sm" leftIcon={<Type size={16} />} onClick={addTextBlock}>
                        Testo
                    </Button>
                    <Button variant="secondary" size="sm" leftIcon={<Image size={16} />} onClick={addImageBlock}>
                        Immagine
                    </Button>
                    <Button variant="secondary" size="sm" leftIcon={<Video size={16} />} onClick={addVideoBlock}>
                        Video
                    </Button>
                </div>
            )}
        </div>
    );
}
