import { useState, useRef, useEffect } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import { LayoutRuleOption } from "@/services/supabase/layoutScheduling";
import styles from "../ProgrammingRuleDetail.module.scss";

export type TargetMode = "all" | "activities" | "groups";

interface TargetSectionProps {
    name: string;
    targetMode: TargetMode;
    activityIds: string[];
    groupIds: string[];
    tenantActivities: LayoutRuleOption[];
    tenantGroups: LayoutRuleOption[];
    onFormChange: (
        updates: Partial<{
            name: string;
            targetMode: TargetMode;
            activityIds: string[];
            groupIds: string[];
        }>
    ) => void;
}

// ─── MultiSelectChip ───────────────────────────────────────────────────────────

interface MultiSelectChipProps {
    label: string;
    placeholder: string;
    options: LayoutRuleOption[];
    selectedIds: string[];
    onAdd: (id: string) => void;
    onRemove: (id: string) => void;
}

function MultiSelectChip({
    label,
    placeholder,
    options,
    selectedIds,
    onAdd,
    onRemove
}: MultiSelectChipProps) {
    const [query, setQuery] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedSet = new Set(selectedIds);

    const filtered = options.filter(
        opt => !selectedSet.has(opt.id) && opt.name.toLowerCase().includes(query.toLowerCase())
    );

    // Close on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const handleSelect = (id: string) => {
        onAdd(id);
        setQuery("");
        setIsOpen(false);
    };

    const selectedOptions = selectedIds
        .map(id => options.find(o => o.id === id))
        .filter(Boolean) as LayoutRuleOption[];

    return (
        <div className={styles.multiSelectBlock}>
            <Text variant="caption" colorVariant="muted" className={styles.multiSelectLabel}>
                {label}
            </Text>

            {/* Chips */}
            {selectedOptions.length > 0 && (
                <div className={styles.chipsRow}>
                    {selectedOptions.map(opt => (
                        <span key={opt.id} className={styles.chip}>
                            <span className={styles.chipLabel}>{opt.name}</span>
                            <button
                                type="button"
                                className={styles.chipRemove}
                                onClick={() => onRemove(opt.id)}
                                aria-label={`Rimuovi ${opt.name}`}
                            >
                                ✕
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* Search + Dropdown */}
            <div className={styles.multiSelectWrapper} ref={containerRef}>
                <input
                    type="text"
                    className={styles.multiSelectInput}
                    placeholder={placeholder}
                    value={query}
                    onChange={e => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    autoComplete="off"
                />
                {isOpen && filtered.length > 0 && (
                    <ul className={styles.multiSelectDropdown} role="listbox">
                        {filtered.slice(0, 20).map(opt => (
                            <li
                                key={opt.id}
                                role="option"
                                aria-selected={false}
                                className={styles.multiSelectDropdownItem}
                                onMouseDown={e => {
                                    e.preventDefault();
                                    handleSelect(opt.id);
                                }}
                            >
                                {opt.name}
                            </li>
                        ))}
                    </ul>
                )}
                {isOpen && filtered.length === 0 && query.length > 0 && (
                    <div className={styles.multiSelectEmpty}>Nessun risultato</div>
                )}
            </div>
        </div>
    );
}

// ─── TargetSection ─────────────────────────────────────────────────────────────

export function TargetSection({
    name,
    targetMode,
    activityIds,
    groupIds,
    tenantActivities,
    tenantGroups,
    onFormChange
}: TargetSectionProps) {
    const handleModeChange = (newMode: TargetMode) => {
        if (newMode === "all") {
            onFormChange({ targetMode: "all", activityIds: [], groupIds: [] });
        } else if (newMode === "activities") {
            onFormChange({ targetMode: "activities", groupIds: [] });
        } else {
            onFormChange({ targetMode: "groups", activityIds: [] });
        }
    };

    const handleAddActivity = (id: string) => {
        if (!activityIds.includes(id)) {
            onFormChange({ activityIds: [...activityIds, id] });
        }
    };

    const handleRemoveActivity = (id: string) => {
        onFormChange({ activityIds: activityIds.filter(x => x !== id) });
    };

    const handleAddGroup = (id: string) => {
        if (!groupIds.includes(id)) {
            onFormChange({ groupIds: [...groupIds, id] });
        }
    };

    const handleRemoveGroup = (id: string) => {
        onFormChange({ groupIds: groupIds.filter(x => x !== id) });
    };

    const radioOptions: Array<{ value: TargetMode; label: string; description: string }> = [
        {
            value: "all",
            label: "Tutte le sedi",
            description: "La regola si applica a tutte le sedi del tenant"
        },
        {
            value: "activities",
            label: "Sedi specifiche",
            description: "Seleziona una o più sedi specifiche"
        },
        {
            value: "groups",
            label: "Gruppi di sedi",
            description: "Seleziona uno o più gruppi"
        }
    ];

    return (
        <section className={styles.sectionCard}>
            <Text as="h3" variant="title-sm">
                Target
            </Text>

            <TextInput
                label="Nome regola"
                value={name}
                onChange={event => onFormChange({ name: event.target.value })}
                required
            />

            {/* Mode selector */}
            <div className={styles.targetModeGroup}>
                {radioOptions.map(opt => (
                    <label key={opt.value} className={styles.targetModeOption}>
                        <input
                            type="radio"
                            name="targetMode"
                            value={opt.value}
                            checked={targetMode === opt.value}
                            onChange={event =>
                                handleModeChange(event.target.value as TargetMode)
                            }
                            className={styles.targetModeRadio}
                        />
                        <div className={styles.targetModeContent}>
                            <Text variant="body-sm" weight={600}>
                                {opt.label}
                            </Text>
                            <Text variant="caption" colorVariant="muted">
                                {opt.description}
                            </Text>
                        </div>
                    </label>
                ))}
            </div>

            {/* Conditional multi-select */}
            {targetMode === "activities" && (
                <MultiSelectChip
                    label="Sedi selezionate"
                    placeholder="Cerca sede..."
                    options={tenantActivities}
                    selectedIds={activityIds}
                    onAdd={handleAddActivity}
                    onRemove={handleRemoveActivity}
                />
            )}

            {targetMode === "groups" && (
                <MultiSelectChip
                    label="Gruppi selezionati"
                    placeholder="Cerca gruppo..."
                    options={tenantGroups}
                    selectedIds={groupIds}
                    onAdd={handleAddGroup}
                    onRemove={handleRemoveGroup}
                />
            )}
        </section>
    );
}
