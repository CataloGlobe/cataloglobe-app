import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
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
    rectSortingStrategy,
    useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Pill } from "@/components/ui/Pill/Pill";
import { useToast } from "@/context/Toast/ToastContext";
import { V2Ingredient } from "@/services/supabase/ingredients";
import styles from "./IngredientCombobox.module.scss";

type IngredientComboboxProps = {
    ingredients: V2Ingredient[];
    /** Ordinati: la posizione nell'array è l'ordine mostrato in pagina pubblica. */
    selectedIds: string[];
    onToggle: (id: string) => void;
    onCreate: (name: string) => Promise<string>;
    isLoadingIngredients: boolean;
    /**
     * Riordino drag & drop delle pill già selezionate. Se assente le pill
     * restano statiche (call site che non gestisce l'ordine).
     * Entra nel draft del parent: nessun salvataggio immediato sul drag.
     */
    onReorder?: (nextIds: string[]) => void;
};

/**
 * Pill trascinabile. Il `transform` inline arriva da dnd-kit ed è stato di
 * drag, non styling: la resa statica vive tutta in Pill + `.selectedPills`.
 */
function SortableIngredientPill({
    id,
    label,
    onRemove
}: {
    id: string;
    label: string;
    onRemove: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id });

    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? 0.55 : undefined,
                touchAction: "none"
            }}
            {...attributes}
            {...listeners}
        >
            <Pill label={label} active onClick={onRemove} />
        </div>
    );
}

export function IngredientCombobox({
    ingredients,
    selectedIds,
    onToggle,
    onCreate,
    isLoadingIngredients,
    onReorder
}: IngredientComboboxProps) {
    const listboxId = useId();
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useToast();

    const [query, setQuery] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    const trimmedQuery = query.trim();

    const filtered: V2Ingredient[] = ingredients.filter(
        i =>
            !selectedIds.includes(i.id) &&
            (trimmedQuery === "" || i.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
    );

    const exactMatch =
        trimmedQuery !== "" &&
        ingredients.some(i => i.name.toLowerCase() === trimmedQuery.toLowerCase());

    const showCreate = trimmedQuery.length > 0 && !exactMatch;
    const totalOptions = filtered.length + (showCreate ? 1 : 0);
    const createOptionIndex = showCreate ? filtered.length : -1;

    // Close on click outside
    useEffect(() => {
        const handleMouseDown = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleMouseDown);
        return () => document.removeEventListener("mousedown", handleMouseDown);
    }, []);

    // Reset active index when query changes
    useEffect(() => {
        setActiveIndex(-1);
    }, [query]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
        setIsOpen(true);
    };

    const selectIngredient = (id: string) => {
        onToggle(id);
        setQuery("");
        setIsOpen(false);
        setActiveIndex(-1);
        inputRef.current?.focus();
    };

    const handleCreate = async () => {
        if (!trimmedQuery || isCreating) return;
        setIsCreating(true);
        try {
            const newId = await onCreate(trimmedQuery);
            onToggle(newId);
            setQuery("");
            setIsOpen(false);
            setActiveIndex(-1);
            inputRef.current?.focus();
        } catch (error: unknown) {
            const msg =
                error instanceof Error
                    ? error.message
                    : "Impossibile creare l'ingrediente.";
            showToast({ message: msg, type: "error" });
            // Keep query so the user can retry or correct
        } finally {
            setIsCreating(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        switch (e.key) {
            case "ArrowDown": {
                if (!isOpen || totalOptions === 0) return;
                e.preventDefault();
                setActiveIndex(prev => (prev + 1) % totalOptions);
                break;
            }
            case "ArrowUp": {
                if (!isOpen || totalOptions === 0) return;
                e.preventDefault();
                setActiveIndex(prev => (prev <= 0 ? totalOptions - 1 : prev - 1));
                break;
            }
            case "Enter": {
                e.preventDefault();
                if (activeIndex === createOptionIndex) {
                    handleCreate();
                } else if (activeIndex >= 0 && activeIndex < filtered.length) {
                    selectIngredient(filtered[activeIndex].id);
                } else if (filtered.length === 1) {
                    selectIngredient(filtered[0].id);
                } else if (filtered.length === 0 && showCreate) {
                    handleCreate();
                }
                break;
            }
            case "Escape": {
                e.preventDefault();
                setIsOpen(false);
                setQuery("");
                setActiveIndex(-1);
                break;
            }
        }
    };

    // Ordine dettato da `selectedIds` (= ordine del draft, poi `sort_order`),
    // NON dall'ordine alfabetico di `ingredients`.
    const selectedIngredients = useMemo(
        () =>
            selectedIds
                .map(id => ingredients.find(i => i.id === id))
                .filter((i): i is V2Ingredient => i !== undefined),
        [selectedIds, ingredients]
    );

    const sensors = useSensors(
        // distance: 5 — sotto quella soglia il gesto resta un click, così la
        // pill continua a rimuovere l'ingrediente invece di iniziare un drag.
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        if (!onReorder) return;
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = selectedIds.indexOf(String(active.id));
        const newIndex = selectedIds.indexOf(String(over.id));
        if (oldIndex < 0 || newIndex < 0) return;
        // Nessun save qui: l'ordine entra nel draft del parent e viene
        // persistito dall'azione Salva unica dell'header.
        onReorder(arrayMove(selectedIds, oldIndex, newIndex));
    };

    const activeDescendant =
        activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

    return (
        <div ref={containerRef} className={styles.combobox}>
            <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={isOpen}
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-activedescendant={activeDescendant}
                className={styles.input}
                placeholder={
                    isLoadingIngredients
                        ? "Caricamento ingredienti..."
                        : "Cerca o aggiungi ingrediente..."
                }
                value={query}
                onChange={handleInputChange}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleKeyDown}
                disabled={isCreating || isLoadingIngredients}
                autoComplete="off"
            />

            {isOpen && totalOptions > 0 && (
                <ul
                    id={listboxId}
                    role="listbox"
                    className={styles.dropdown}
                    aria-label="Ingredienti disponibili"
                >
                    {filtered.map((ingredient, index) => (
                        <li
                            key={ingredient.id}
                            id={`${listboxId}-option-${index}`}
                            role="option"
                            aria-selected={false}
                            className={`${styles.dropdownItem}${index === activeIndex ? ` ${styles.dropdownItemActive}` : ""}`}
                            onMouseDown={e => {
                                e.preventDefault(); // prevent blur before click registers
                                selectIngredient(ingredient.id);
                            }}
                            onMouseEnter={() => setActiveIndex(index)}
                        >
                            {ingredient.name}
                        </li>
                    ))}

                    {showCreate && (
                        <li
                            id={`${listboxId}-option-${createOptionIndex}`}
                            role="option"
                            aria-selected={false}
                            className={`${styles.dropdownItem} ${styles.createOption}${createOptionIndex === activeIndex ? ` ${styles.dropdownItemActive}` : ""}`}
                            onMouseDown={e => {
                                e.preventDefault();
                                handleCreate();
                            }}
                            onMouseEnter={() => setActiveIndex(createOptionIndex)}
                        >
                            <IconPlus size={14} />
                            <span>Crea &ldquo;{trimmedQuery}&rdquo;</span>
                        </li>
                    )}
                </ul>
            )}

            {selectedIngredients.length > 0 &&
                (onReorder ? (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={selectedIngredients.map(i => i.id)}
                            strategy={rectSortingStrategy}
                        >
                            <div className={styles.selectedPills}>
                                {selectedIngredients.map(ingredient => (
                                    <SortableIngredientPill
                                        key={ingredient.id}
                                        id={ingredient.id}
                                        label={ingredient.name}
                                        onRemove={() => onToggle(ingredient.id)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                ) : (
                    <div className={styles.selectedPills}>
                        {selectedIngredients.map(ingredient => (
                            <Pill
                                key={ingredient.id}
                                label={ingredient.name}
                                active
                                onClick={() => onToggle(ingredient.id)}
                            />
                        ))}
                    </div>
                ))}
        </div>
    );
}
