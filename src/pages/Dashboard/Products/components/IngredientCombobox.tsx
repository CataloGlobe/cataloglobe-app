import React, { useEffect, useId, useRef, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { Pill } from "@/components/ui/Pill/Pill";
import { useToast } from "@/context/Toast/ToastContext";
import { V2Ingredient } from "@/services/supabase/ingredients";
import styles from "./IngredientCombobox.module.scss";

type IngredientComboboxProps = {
    ingredients: V2Ingredient[];
    selectedIds: string[];
    onToggle: (id: string) => void;
    onCreate: (name: string) => Promise<string>;
    isLoadingIngredients: boolean;
};

export function IngredientCombobox({
    ingredients,
    selectedIds,
    onToggle,
    onCreate,
    isLoadingIngredients
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

    const selectedIngredients = ingredients.filter(i => selectedIds.includes(i.id));

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

            {selectedIngredients.length > 0 && (
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
            )}
        </div>
    );
}
