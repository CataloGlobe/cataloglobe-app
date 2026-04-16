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
import Text from "@/components/ui/Text/Text";
import type { LayoutRuleOption } from "@/services/supabase/layoutScheduling";
import type { FeaturedContentItem } from "./AssociatedContentSection";
import styles from "../ProgrammingRuleDetail.module.scss";

// ─── SortableFeaturedRow ─────────────────────────────────────────────────────

interface SortableFeaturedRowProps {
    item: FeaturedContentItem;
    name: string;
    onRemove: () => void;
}

function SortableFeaturedRow({ item, name, onRemove }: SortableFeaturedRowProps) {
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
                + Aggiungi contenuto
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

// ─── SlotGroup ───────────────────────────────────────────────────────────────

type SlotGroupProps = {
    title: string;
    slot: FeaturedContentItem["slot"];
    items: FeaturedContentItem[];
    nameById: Map<string, string>;
    availableContents: LayoutRuleOption[];
    allEmpty: boolean;
    onAdd: (id: string, slot: FeaturedContentItem["slot"]) => void;
    onRemove: (id: string) => void;
    onReorder: (slot: FeaturedContentItem["slot"], activeId: string, overId: string) => void;
};

function SlotGroup({
    title,
    slot,
    items,
    nameById,
    availableContents,
    allEmpty,
    onAdd,
    onRemove,
    onReorder
}: SlotGroupProps) {
    const sensors = useSensors(useSensor(PointerSensor));

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        onReorder(slot, active.id as string, over.id as string);
    };

    return (
        <div className={styles.slotGroup}>
            <Text as="h4" variant="body-sm" weight={600} className={styles.slotGroupTitle}>
                {title}
            </Text>

            {items.length > 0 ? (
                <div className={styles.featuredListBorder}>
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={items.map(fc => fc.featuredContentId)}
                            strategy={verticalListSortingStrategy}
                        >
                            {items.map(fc => (
                                <SortableFeaturedRow
                                    key={fc.featuredContentId}
                                    item={fc}
                                    name={nameById.get(fc.featuredContentId) ?? fc.featuredContentId}
                                    onRemove={() => onRemove(fc.featuredContentId)}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                </div>
            ) : (
                <Text variant="caption" colorVariant="muted" className={styles.slotGroupEmpty}>
                    Nessun contenuto
                </Text>
            )}

            <FeaturedContentPicker
                available={availableContents}
                allEmpty={allEmpty}
                onSelect={id => onAdd(id, slot)}
            />
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
    const featuredNameById = useMemo(
        () => new Map(tenantFeaturedContents.map(fc => [fc.id, fc.name])),
        [tenantFeaturedContents]
    );

    const usedIds = useMemo(
        () => new Set(featuredContents.map(fc => fc.featuredContentId)),
        [featuredContents]
    );

    const availableFeaturedContents = tenantFeaturedContents.filter(fc => !usedIds.has(fc.id));

    const beforeItems = useMemo(
        () => featuredContents
            .filter(fc => fc.slot === "before_catalog")
            .sort((a, b) => a.sortOrder - b.sortOrder),
        [featuredContents]
    );

    const afterItems = useMemo(
        () => featuredContents
            .filter(fc => fc.slot === "after_catalog")
            .sort((a, b) => a.sortOrder - b.sortOrder),
        [featuredContents]
    );

    const rebuildArray = (
        before: FeaturedContentItem[],
        after: FeaturedContentItem[]
    ): FeaturedContentItem[] => [
        ...before.map((fc, i) => ({ ...fc, sortOrder: i })),
        ...after.map((fc, i) => ({ ...fc, sortOrder: i }))
    ];

    const handleAdd = (id: string, slot: FeaturedContentItem["slot"]) => {
        const slotItems = slot === "before_catalog" ? beforeItems : afterItems;
        const newItem: FeaturedContentItem = {
            featuredContentId: id,
            slot,
            sortOrder: slotItems.length
        };
        const newBefore = slot === "before_catalog" ? [...beforeItems, newItem] : beforeItems;
        const newAfter = slot === "after_catalog" ? [...afterItems, newItem] : afterItems;
        onFormChange({ featuredContents: rebuildArray(newBefore, newAfter) });
    };

    const handleRemove = (id: string) => {
        const newBefore = beforeItems.filter(fc => fc.featuredContentId !== id);
        const newAfter = afterItems.filter(fc => fc.featuredContentId !== id);
        onFormChange({ featuredContents: rebuildArray(newBefore, newAfter) });
    };

    const handleReorder = (slot: FeaturedContentItem["slot"], activeId: string, overId: string) => {
        const items = slot === "before_catalog" ? [...beforeItems] : [...afterItems];
        const oldIndex = items.findIndex(fc => fc.featuredContentId === activeId);
        const newIndex = items.findIndex(fc => fc.featuredContentId === overId);
        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(items, oldIndex, newIndex);
        const newBefore = slot === "before_catalog" ? reordered : beforeItems;
        const newAfter = slot === "after_catalog" ? reordered : afterItems;
        onFormChange({ featuredContents: rebuildArray(newBefore, newAfter) });
    };

    return (
        <section className={styles.sectionCard}>
            <Text as="h3" variant="title-sm">
                Contenuti in evidenza
            </Text>

            <div className={styles.slotGroupsContainer}>
                <SlotGroup
                    title="Prima del catalogo"
                    slot="before_catalog"
                    items={beforeItems}
                    nameById={featuredNameById}
                    availableContents={availableFeaturedContents}
                    allEmpty={tenantFeaturedContents.length === 0}
                    onAdd={handleAdd}
                    onRemove={handleRemove}
                    onReorder={handleReorder}
                />

                <SlotGroup
                    title="Dopo il catalogo"
                    slot="after_catalog"
                    items={afterItems}
                    nameById={featuredNameById}
                    availableContents={availableFeaturedContents}
                    allEmpty={tenantFeaturedContents.length === 0}
                    onAdd={handleAdd}
                    onRemove={handleRemove}
                    onReorder={handleReorder}
                />
            </div>
        </section>
    );
}
