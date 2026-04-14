import { useEffect, useMemo, useRef, useState } from "react";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from "@dnd-kit/core";
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
    arrayMove
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { Select } from "@/components/ui/Select/Select";
import Text from "@/components/ui/Text/Text";
import type { LayoutRuleOption } from "@/services/supabase/layoutScheduling";
import type { FeaturedContentItem } from "./AssociatedContentSection";
import styles from "../ProgrammingRuleDetail.module.scss";

const SLOT_OPTIONS: { value: FeaturedContentItem["slot"]; label: string }[] = [
    { value: "before_catalog", label: "Prima del catalogo" },
    { value: "after_catalog", label: "Dopo il catalogo" }
];

// ─── SortableFeaturedRow ─────────────────────────────────────────────────────

interface SortableFeaturedRowProps {
    item: FeaturedContentItem;
    name: string;
    onSlotChange: (slot: FeaturedContentItem["slot"]) => void;
    onRemove: () => void;
}

function SortableFeaturedRow({ item, name, onSlotChange, onRemove }: SortableFeaturedRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: item.featuredContentId
    });

    const rowStyle = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1
    };

    return (
        <div
            ref={setNodeRef}
            style={rowStyle}
            className={`${styles.featuredRow} ${isDragging ? styles.featuredRowDragging : ""}`}
        >
            <span
                className={styles.featuredDragHandle}
                {...attributes}
                {...listeners}
                aria-label="Trascina per riordinare"
            >
                <GripVertical size={14} />
            </span>

            <Text variant="body-sm" className={styles.featuredRowName}>
                {name}
            </Text>

            <div className={styles.featuredRowSlot}>
                <Select
                    value={item.slot}
                    onChange={e => onSlotChange(e.target.value as FeaturedContentItem["slot"])}
                    options={SLOT_OPTIONS}
                />
            </div>

            <button
                type="button"
                className={styles.featuredRemoveButton}
                onClick={onRemove}
                aria-label={`Rimuovi ${name}`}
            >
                <X size={14} />
            </button>
        </div>
    );
}

// ─── FeaturedContentPicker ───────────────────────────────────────────────────

interface FeaturedContentPickerProps {
    available: LayoutRuleOption[];
    allEmpty: boolean;
    onSelect: (id: string) => void;
}

function FeaturedContentPicker({ available, allEmpty, onSelect }: FeaturedContentPickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [isOpen]);

    const handleSelect = (id: string) => {
        onSelect(id);
        setIsOpen(false);
    };

    const isEmpty = allEmpty
        ? "Nessun contenuto in evidenza disponibile — creane uno dalla sezione Highlights"
        : available.length === 0
          ? "Tutti i contenuti sono già stati aggiunti"
          : null;

    return (
        <div ref={containerRef} className={styles.featuredPickerWrapper}>
            <button
                type="button"
                className={styles.featuredPickerTrigger}
                onClick={() => setIsOpen(v => !v)}
            >
                + Aggiungi contenuto in evidenza
            </button>

            {isOpen && (
                <div className={styles.featuredPickerDropdown}>
                    {isEmpty ? (
                        <Text
                            variant="caption"
                            colorVariant="muted"
                            className={styles.featuredPickerEmpty}
                        >
                            {isEmpty}
                        </Text>
                    ) : (
                        available.map(opt => (
                            <button
                                key={opt.id}
                                type="button"
                                className={styles.featuredPickerItem}
                                onMouseDown={e => {
                                    e.preventDefault();
                                    handleSelect(opt.id);
                                }}
                            >
                                {opt.name}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

// ─── FeaturedContentSection ──────────────────────────────────────────────────

export interface FeaturedContentSectionProps {
    featuredContents: FeaturedContentItem[];
    tenantFeaturedContents: LayoutRuleOption[];
    onFormChange: (updates: { featuredContents: FeaturedContentItem[] }) => void;
}

export function FeaturedContentSection({
    featuredContents,
    tenantFeaturedContents,
    onFormChange
}: FeaturedContentSectionProps) {
    const sensors = useSensors(useSensor(PointerSensor));

    const featuredNameById = useMemo(
        () => new Map(tenantFeaturedContents.map(fc => [fc.id, fc.name])),
        [tenantFeaturedContents]
    );

    const availableFeaturedContents = tenantFeaturedContents.filter(
        fc => !featuredContents.find(sel => sel.featuredContentId === fc.id)
    );

    const handleFeaturedDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = featuredContents.findIndex(fc => fc.featuredContentId === active.id);
        const newIndex = featuredContents.findIndex(fc => fc.featuredContentId === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(featuredContents, oldIndex, newIndex).map((fc, i) => ({
            ...fc,
            sortOrder: i
        }));

        onFormChange({ featuredContents: reordered });
    };

    const handleAddFeaturedContent = (id: string) => {
        const next: FeaturedContentItem = {
            featuredContentId: id,
            slot: "before_catalog",
            sortOrder: featuredContents.length
        };
        onFormChange({ featuredContents: [...featuredContents, next] });
    };

    const handleRemoveFeaturedContent = (id: string) => {
        const filtered = featuredContents
            .filter(fc => fc.featuredContentId !== id)
            .map((fc, i) => ({ ...fc, sortOrder: i }));
        onFormChange({ featuredContents: filtered });
    };

    const handleSlotChange = (id: string, slot: FeaturedContentItem["slot"]) => {
        const updated = featuredContents.map(fc =>
            fc.featuredContentId === id ? { ...fc, slot } : fc
        );
        onFormChange({ featuredContents: updated });
    };

    return (
        <section className={styles.sectionCard}>
            <Text as="h3" variant="title-sm">
                Contenuti in evidenza
            </Text>

            <div className={styles.featuredList}>
                {featuredContents.length > 0 && (
                    <div className={styles.featuredListBorder}>
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleFeaturedDragEnd}
                        >
                            <SortableContext
                                items={featuredContents.map(fc => fc.featuredContentId)}
                                strategy={verticalListSortingStrategy}
                            >
                                {featuredContents.map(fc => (
                                    <SortableFeaturedRow
                                        key={fc.featuredContentId}
                                        item={fc}
                                        name={
                                            featuredNameById.get(fc.featuredContentId) ??
                                            fc.featuredContentId
                                        }
                                        onSlotChange={slot =>
                                            handleSlotChange(fc.featuredContentId, slot)
                                        }
                                        onRemove={() =>
                                            handleRemoveFeaturedContent(fc.featuredContentId)
                                        }
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    </div>
                )}

                <FeaturedContentPicker
                    available={availableFeaturedContents}
                    allEmpty={tenantFeaturedContents.length === 0}
                    onSelect={handleAddFeaturedContent}
                />
            </div>
        </section>
    );
}
