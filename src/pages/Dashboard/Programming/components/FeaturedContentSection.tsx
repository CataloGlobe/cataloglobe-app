import { useMemo } from "react";
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
import { Select } from "@/components/ui/Select/Select";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
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
    /** Nome accessibile: «Aggiungi un contenuto sopra il menù». */
    label: string;
    available: LayoutRuleOption[];
    allEmpty: boolean;
    onSelect: (id: string) => void;
}

/**
 * I contenuti sono una lista corta: una `Select` di sistema (P5 del passo
 * 2-bis) al posto del menu a tendina fatto a mano. Scelto un contenuto, la
 * Select torna vuota; senza contenuti da aggiungere è spenta e lo dice.
 */
function FeaturedContentPicker({ label, available, allEmpty, onSelect }: FeaturedContentPickerProps) {
    const placeholder = allEmpty
        ? "Non ci sono contenuti pubblicati"
        : available.length === 0
          ? "Tutti i contenuti sono già stati aggiunti"
          : "Aggiungi un contenuto…";

    return (
        <Select
            aria-label={label}
            value=""
            disabled={available.length === 0}
            onChange={event => {
                if (event.target.value) onSelect(event.target.value);
            }}
            options={[
                { value: "", label: placeholder, disabled: true },
                ...available.map(opt => ({ value: opt.id, label: opt.name }))
            ]}
        />
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
                label={`Aggiungi un contenuto ${title.toLowerCase()}`}
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
    const { catalogLabel } = useVerticalConfig();
    const menu = catalogLabel.toLowerCase();
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
                In evidenza
            </Text>

            <div className={styles.slotGroupsContainer}>
                <SlotGroup
                    title={`Sopra il ${menu}`}
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
                    title={`Sotto il ${menu}`}
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
