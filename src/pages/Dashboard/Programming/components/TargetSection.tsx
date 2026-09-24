import { useState, useRef, useEffect } from "react";
import { Building2, Globe, Search, Users } from "lucide-react";
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
    /** Errore del nome (`validateRuleForm`), sotto il campo. */
    nameError?: string;
    onNameBlur?: () => void;
}

// ─── MultiSelectChip ───────────────────────────────────────────────────────────

interface MultiSelectChipProps {
    label: string;
    placeholder: string;
    /** Stessa icona usata dal chip target nella riga lista (sede vs gruppo). */
    icon: typeof Building2;
    options: LayoutRuleOption[];
    selectedIds: string[];
    onAdd: (id: string) => void;
    onRemove: (id: string) => void;
}

function MultiSelectChip({
    label,
    placeholder,
    icon: Icon,
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
            <span className={styles.multiSelectLabel}>{label}</span>

            {/* Chips */}
            {selectedOptions.length > 0 && (
                <div className={styles.chipsRow}>
                    {selectedOptions.map(opt => (
                        <span key={opt.id} className={styles.chip}>
                            <Icon size={12} className={styles.chipIcon} aria-hidden="true" />
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
                <div
                    className={styles.multiSelectInputWrapper}
                    onClick={e => {
                        const input = (e.currentTarget as HTMLElement).querySelector("input");
                        input?.focus();
                    }}
                >
                    <Search size={14} className={styles.searchIcon} />
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
                </div>
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
    onFormChange,
    nameError,
    onNameBlur
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

    /* Stesse icone del chip target nella riga lista (RuleRow): su mobile il
       chip sparisce dalla riga, quindi la distinzione visiva sede / gruppo /
       tutte deve restare riconoscibile qui. */
    const radioOptions: Array<{
        value: TargetMode;
        label: string;
        description: string;
        icon: typeof Globe;
    }> = [
        {
            value: "all",
            label: "Tutte le sedi",
            description: "Anche quelle che aggiungerai.",
            icon: Globe
        },
        {
            value: "activities",
            label: "Alcune sedi",
            description: "Scegli le sedi una per una.",
            icon: Building2
        },
        {
            value: "groups",
            label: "Gruppi di sedi",
            description: "Vale per le sedi del gruppo, anche se il gruppo cambia.",
            icon: Users
        }
    ];

    return (
        <section className={styles.sectionCard}>
            <Text as="h3" variant="title-sm">
                Dove si applica
            </Text>

            <TextInput
                id="rule-field-name"
                label="Nome"
                value={name}
                onChange={event => onFormChange({ name: event.target.value })}
                onBlur={onNameBlur}
                error={nameError}
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
                            <opt.icon
                                size={14}
                                className={styles.targetModeIcon}
                                aria-hidden="true"
                            />
                            <span className={styles.targetModeLabel}>{opt.label}</span>
                            <span className={styles.targetModeDesc}>· {opt.description}</span>
                        </div>
                    </label>
                ))}
            </div>

            {/* Conditional multi-select */}
            {targetMode === "activities" && (
                <MultiSelectChip
                    label="Sedi selezionate"
                    placeholder="Cerca sede..."
                    icon={Building2}
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
                    icon={Users}
                    options={tenantGroups}
                    selectedIds={groupIds}
                    onAdd={handleAddGroup}
                    onRemove={handleRemoveGroup}
                />
            )}
        </section>
    );
}
