import React, { useEffect, useRef } from "react";
import { GripVertical, Rows3, Trash2 } from "lucide-react";
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
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { SortableDataTableRow } from "@/components/ui/DataTable/SortableDataTableRow";
import { StoryBlock, MAX_STORY_IMAGES } from "@/services/supabase/stories";
import { AddBlockMenu } from "./AddBlockMenu";
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
    /** Id del blocco appena aggiunto (via "Aggiungi" in header) — scroll+focus one-shot. */
    focusBlockId?: string | null;
    /** Consumato lo scroll+focus, il parent azzera focusBlockId. */
    onFocusHandled?: () => void;
    /** Stesso handler passato ad `AddBlockMenu` in header — CTA dello stato vuoto. */
    onAddBlock?: (type: StoryBlock["type"]) => void;
}

interface BlockRowProps {
    block: StoryBlock;
    pendingImage: File | null;
    onPendingImageChange: (file: File | null) => void;
    disabled?: boolean;
    onUpdate: (next: StoryBlock) => void;
    onRemove: () => void;
    rowRef?: (el: HTMLDivElement | null) => void;
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
    rowRef,
    dragHandleProps
}: BlockRowProps) {
    return (
        <div ref={rowRef} className={styles.block}>
            <button
                type="button"
                aria-label="Trascina per riordinare"
                className={styles.dragHandle}
                {...(dragHandleProps as React.HTMLAttributes<HTMLButtonElement>)}
            >
                <GripVertical size={16} />
            </button>

            <div className={styles.blockBody} data-block-body>
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
    disabled,
    focusBlockId,
    onFocusHandled,
    onAddBlock
}: StoryBlockEditorProps) {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const rowElRefs = useRef<Record<string, HTMLDivElement | null>>({});

    // Scroll+focus one-shot sul blocco appena aggiunto da "Aggiungi" (header
    // sezione Contenuto): il blocco va renderizzato prima che il ref esista,
    // quindi l'effetto scatta DOPO il render con l'id già in `value`.
    useEffect(() => {
        if (!focusBlockId) return;
        const el = rowElRefs.current[focusBlockId];
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Primo controllo utile per tipo: textarea (Testo), dropzone (Immagine,
        // vuota su blocco nuovo), select Provider (Video). Scoperto solo dentro
        // il corpo del blocco: esclude drag-handle/elimina.
        const focusable = el
            .querySelector("[data-block-body]")
            ?.querySelector<HTMLElement>("textarea, select, [role='button']");
        // Il focus va rimandato al frame successivo: chiamarlo subito genera un
        // evento focusout SINCRONO che il FocusScope del DropdownMenu (Radix,
        // ancora montato in questo stesso tick) intercetta e usa per riportare
        // il focus dentro il menu in chiusura — misurato con Playwright.
        requestAnimationFrame(() => focusable?.focus());
        onFocusHandled?.();
    }, [focusBlockId, onFocusHandled]);

    const imageDisabled = value.filter(b => b.type === "image").length >= MAX_STORY_IMAGES;

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

    return (
        <div className={styles.root}>
            {value.length === 0 && (
                <EmptyState
                    icon={<Rows3 size={24} strokeWidth={1.8} />}
                    title="Nessun blocco ancora"
                    description="Aggiungi testo, immagini o video per raccontare la tua storia."
                    action={
                        !disabled && onAddBlock ? (
                            <AddBlockMenu onAdd={onAddBlock} imageDisabled={imageDisabled} />
                        ) : undefined
                    }
                />
            )}

            {value.length > 0 && (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={value.map(b => b.id)} strategy={verticalListSortingStrategy}>
                        <div className={styles.list}>
                            {value.map(block => (
                                <SortableDataTableRow key={block.id} id={block.id} draggingOpacity={1}>
                                    <BlockRow
                                        block={block}
                                        pendingImage={pendingImages[block.id] ?? null}
                                        onPendingImageChange={file => onPendingImageChange(block.id, file)}
                                        disabled={disabled}
                                        onUpdate={next => updateBlock(block.id, next)}
                                        onRemove={() => removeBlock(block)}
                                        rowRef={el => {
                                            rowElRefs.current[block.id] = el;
                                        }}
                                    />
                                </SortableDataTableRow>
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}
        </div>
    );
}
